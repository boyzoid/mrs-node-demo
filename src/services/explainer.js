import fs from 'node:fs';
import { createSign, createHash } from 'node:crypto';
import { ociSdkChat } from './ociSdkClient.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function haveOciConfig() {
  const req = [
    'OCI_REGION',
    'OCI_COMPARTMENT_ID',
    'OCI_MODEL_NAME',
    'OCI_TENANCY_OCID',
    'OCI_USER_OCID',
    'OCI_FINGERPRINT',
  ];
  const missing = req.filter((k) => !process.env[k]);
  const hasKey = !!(process.env.OCI_PRIVATE_KEY_PEM || process.env.OCI_PRIVATE_KEY_PATH);
  return { ok: missing.length === 0 && hasKey, missing, hasKey };
}

function readPrivateKeyPem() {
  if (process.env.OCI_PRIVATE_KEY_PEM) {
    // Allow escaped newlines from env files
    return process.env.OCI_PRIVATE_KEY_PEM.replace(/\\n/g, '\n');
  }
  if (process.env.OCI_PRIVATE_KEY_PATH) {
    try { return fs.readFileSync(process.env.OCI_PRIVATE_KEY_PATH, 'utf8'); } catch {}
  }
  return null;
}

function buildOciSignature(method, host, pathWithQuery, body, keyId, privateKeyPem) {
  const content = Buffer.from(body || '', 'utf8');
  const date = new Date().toUTCString();
  const contentType = 'application/json';
  const contentLength = String(content.length);
  const sha256 = createHash('sha256').update(content).digest('base64');
  const headers = ['(request-target)', 'host', 'date', 'content-type', 'content-length', 'x-content-sha256'];
  const signingString = [
    `(request-target): ${method.toLowerCase()} ${pathWithQuery}`,
    `host: ${host}`,
    `date: ${date}`,
    `content-type: ${contentType}`,
    `content-length: ${contentLength}`,
    `x-content-sha256: ${sha256}`,
  ].join('\n');
  const signer = createSign('RSA-SHA256');
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');
  const authorization = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${headers.join(' ')}",signature="${signature}"`;
  return { date, contentType, contentLength, sha256, authorization };
}

async function ociChatCompletion(prompt) {
  const region = process.env.OCI_REGION;
  const compartmentId = process.env.OCI_COMPARTMENT_ID;
  const model = process.env.OCI_MODEL_NAME;
  const tenancy = process.env.OCI_TENANCY_OCID;
  const user = process.env.OCI_USER_OCID;
  const fingerprint = process.env.OCI_FINGERPRINT;
  const keyId = `${tenancy}/${user}/${fingerprint}`;
  const host = `inference.generativeai.${region}.oci.oraclecloud.com`;
  // Support multiple API versions; prefer newer unless overridden
  const apiVersionCandidates = Array.from(new Set([
    (process.env.OCI_GENAI_API_VERSION || '').trim() || null,
    '2024-09-01',
    '2024-10-30', // latest used by this app
    '2023-11-30', // older published date format with dashes
    '20231130',   // older published date format without dashes
  ].filter(Boolean)));
  // Build candidate paths across versions
  const candidatePaths = apiVersionCandidates.flatMap((v) => [
    `/${v}/chat/completions`,
    `/${v}/openai/chat/completions`,
  ]);
  // Keep actions/chat as a final probe (body schema differs; probe only)
  candidatePaths.push(`/${apiVersionCandidates[0]}/actions/chat`);
  const modelId = process.env.OCI_MODEL_ID; // optional: used for actions/chat payload
  const openAiBody = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'You are a concise assistant that summarizes MySQL Sakila actor records for a business app UI. Keep it short and helpful.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  });
  const privateKey = readPrivateKeyPem();
  if (!privateKey) throw new Error('Missing OCI private key. Set OCI_PRIVATE_KEY_PEM or OCI_PRIVATE_KEY_PATH.');
  const debug = process.env.DEBUG_AI === '1';
  let lastErr = null;
  for (const path of candidatePaths) {
    // Choose body schema depending on endpoint style
    const bodyForPath = path.includes('/actions/chat') && modelId
      ? JSON.stringify({
          chatDetails: {
            compartmentId,
            servingMode: { servingType: 'ON_DEMAND', modelId },
            chatRequest: {
              messages: [
                {
                  role: 'USER',
                  content: [ { type: 'TEXT', text: prompt } ],
                },
              ],
              apiFormat: 'GENERIC',
              // Reasonable defaults; OCI will clamp as needed
              maxTokens: 1024,
              temperature: 0.2,
              frequencyPenalty: 0,
              presencePenalty: 0,
              topK: 1,
              topP: 0.95,
            },
          },
        })
      : openAiBody;
    const pathWithQuery = path.includes('/actions/chat')
      ? path
      : `${path}?compartmentId=${encodeURIComponent(compartmentId)}`;
    const url = `https://${host}${pathWithQuery}`;
    console.log('[oci] Trying', url);
    try {
      const sig = buildOciSignature('post', host, pathWithQuery, bodyForPath, keyId, privateKey);
      if (debug) console.log('[oci] POST', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          host,
          date: sig.date,
          'content-type': sig.contentType,
          'content-length': sig.contentLength,
          'x-content-sha256': sig.sha256,
          authorization: sig.authorization,
        },
        body: bodyForPath,
      });
      const text = await res.text();
      if (!res.ok) {
        if (debug) console.log('[oci] status', res.status, 'body', text.slice(0, 300));
        lastErr = new Error(`OCI GenAI error ${res.status}: ${text.slice(0, 300)} (path ${path})`);
        // Try next candidate on 404/405/501 etc.
        if ([404, 405, 501].includes(res.status)) continue;
        throw lastErr;
      }
      try {
        const json = JSON.parse(text);
        const msg = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || text;
        return String(msg);
      } catch {
        return text;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('OCI GenAI call failed for all known paths.');
}

export async function ociProbe() {
  const region = process.env.OCI_REGION;
  const compartmentId = process.env.OCI_COMPARTMENT_ID;
  const model = process.env.OCI_MODEL_NAME;
  const tenancy = process.env.OCI_TENANCY_OCID;
  const user = process.env.OCI_USER_OCID;
  const fingerprint = process.env.OCI_FINGERPRINT;
  const keyId = `${tenancy}/${user}/${fingerprint}`;
  const host = `inference.generativeai.${region}.oci.oraclecloud.com`;
  const apiVersionCandidates = Array.from(new Set([
    (process.env.OCI_GENAI_API_VERSION || '').trim() || null,
    '2024-09-01',
    '2024-10-30',
    '2023-11-30',
    '20231130',
  ].filter(Boolean)));
  const candidatePaths = apiVersionCandidates.flatMap((v) => [
    `/${v}/chat/completions`,
    `/${v}/openai/chat/completions`,
    `/${v}/actions/chat`,
  ]);
  const modelId = process.env.OCI_MODEL_ID;
  const openAiBody = JSON.stringify({
    model,
    messages: [ { role: 'user', content: 'ping' } ],
    temperature: 0.2,
  });
  const privateKey = readPrivateKeyPem();
  if (!privateKey) return { error: 'Missing OCI private key. Set OCI_PRIVATE_KEY_PEM or OCI_PRIVATE_KEY_PATH.' };
  const results = [];
  for (const path of candidatePaths) {
    const bodyForPath = path.includes('/actions/chat') && modelId
      ? JSON.stringify({
          chatDetails: {
            compartmentId,
            servingMode: { servingType: 'ON_DEMAND', modelId },
            chatRequest: {
              messages: [
                { role: 'USER', content: [ { type: 'TEXT', text: 'ping' } ] },
              ],
              apiFormat: 'GENERIC',
              maxTokens: 16,
              temperature: 0.2,
              frequencyPenalty: 0,
              presencePenalty: 0,
              topK: 1,
              topP: 0.95,
            },
          },
        })
      : openAiBody;
    const pathWithQuery = path.includes('/actions/chat')
      ? path
      : `${path}?compartmentId=${encodeURIComponent(compartmentId || '')}`;
    const url = `https://${host}${pathWithQuery}`;
    try {
      const sig = buildOciSignature('post', host, pathWithQuery, bodyForPath, keyId, privateKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          host,
          date: sig.date,
          'content-type': sig.contentType,
          'content-length': sig.contentLength,
          'x-content-sha256': sig.sha256,
          authorization: sig.authorization,
        },
        body: bodyForPath,
      });
      const text = await res.text();
      results.push({ path, url, status: res.status, ok: res.ok, body: text.slice(0, 400) });
    } catch (e) {
      results.push({ path, url, error: String(e && e.message ? e.message : e) });
    }
  }
  return { host, region, model, compartmentId, results };
}

export async function buildAiHtml(actorJsonText) {
  let a;
  try { a = JSON.parse(actorJsonText); } catch {}
  if (!a) {
    return `<p>Could not parse actor JSON. Raw:</p><pre>${escapeHtml(actorJsonText.slice(0, 2000))}</pre>`;
  }
  const name = `${a.firstName || ''} ${a.lastName || ''}`.trim();
  const lastUpdate = a.lastUpdate || '';

  const cfg = haveOciConfig();
  if (cfg.ok) {
    try {
      const prompt = `Summarize this Sakila actor for a business UI. Provide 2-4 short sentences and avoid speculation.\n\n` +
        `Actor JSON: ${JSON.stringify({ actorId: a.actorId, firstName: a.firstName, lastName: a.lastName, lastUpdate: a.lastUpdate })}`;
      const summary = process.env.OCI_USE_SDK === '1'
        ? await ociSdkChat(prompt)
        : await ociChatCompletion(prompt);
      return `
        <article class="card shadow-sm">
          <div class="card-body">
            <h2 class="h4 mb-2">${escapeHtml(name)}</h2>
            <p class="text-body-secondary"><small>Last updated: <code>${escapeHtml(lastUpdate)}</code></small></p>
            <div>${escapeHtml(summary)}</div>
          </div>
        </article>`;
    } catch (e) {
      return `
        <article class="card border-danger-subtle">
          <div class="card-body">
            <h2 class="h5">${escapeHtml(name)}</h2>
            <p class="text-body-secondary"><small>Last updated: <code>${escapeHtml(lastUpdate)}</code></small></p>
            <p class="text-danger"><strong>AI error:</strong> ${escapeHtml(e.message || String(e))}</p>
          </div>
        </article>`;
    }
  }

  // Fallback (no OCI config)
  return `
    <article class="card shadow-sm">
      <div class="card-body">
        <h2 class="h4 mb-2">${escapeHtml(name)}</h2>
        <p class="text-body-secondary"><small>Last updated: <code>${escapeHtml(lastUpdate)}</code></small></p>
        <p><em>AI summary is not configured. Set OCI_* env vars to enable OCI Generative AI.</em></p>
      </div>
    </article>`;
}
