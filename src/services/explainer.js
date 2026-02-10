// Utilities to generate AI-backed HTML snippets for the UI
// Uses OCI Generative AI via ociSdkChat when configured
import { ociSdkChat } from './ociSdkClient.js';

/**
 * Escape string for safe HTML rendering.
 * This avoids accidental HTML/script injection when rendering dynamic content.
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Check that minimum required env vars for OCI chat are present.
 * With the SDK + local ~/.oci/config, we only require:
 *  - OCI_COMPARTMENT_ID
 *  - OCI_MODEL_ID (On-Demand serving)
 * The SDK authentication comes from your OCI config/profile, so additional
 * identity env vars are not mandatory here.
 */
function haveOciConfig() {
  const req = ['OCI_COMPARTMENT_ID', 'OCI_MODEL_ID'];
  const missing = req.filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing };
}

/**
 * Build a small HTML card containing an AI-generated summary for a Sakila actor.
 * Falls back to a non-AI message if OCI is not configured.
 */
export async function buildAiHtml(actorJsonText) {
  let a;
  try {
    a = JSON.parse(actorJsonText);
  } catch (parseErr) {
    return `<p>Could not parse actor JSON. Error: ${escapeHtml(String(parseErr))}</p><pre>${escapeHtml(actorJsonText.slice(0, 500))}</pre>`;
  }
  if (!a) {
    return `<p>Could not parse actor JSON. Raw:</p><pre>${escapeHtml(actorJsonText.slice(0, 2000))}</pre>`;
  }
  const name = `${a.firstName || ''} ${a.lastName || ''}`.trim();
  const lastUpdate = a.lastUpdate || '';

  const cfg = haveOciConfig();
  if (cfg.ok) {
    try {
      const prompt =
        `Summarize this Sakila actor for a business UI. Include their name and mention some of the films they appeared in if available. Provide 2-4 short sentences and avoid speculation.\n\n` +
        `Actor Data: ${JSON.stringify(a)}`;
      const summary = await ociSdkChat(prompt);
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
        <p><em>AI summary is not configured. Set OCI_REGION, OCI_COMPARTMENT_ID, and OCI_MODEL_ID env vars to enable OCI Generative AI.</em></p>
      </div>
    </article>`;
}

/**
 * Basic probe to validate OCI chat configuration and connectivity.
 */
export async function ociProbe() {
  try {
    const cfg = haveOciConfig();
    if (!cfg.ok) {
      return {
        error: `Missing required environment variables: ${cfg.missing.join(', ')}`,
        missing: cfg.missing,
      };
    }

    // Try a simple chat call to test the connection
    const testResult = await ociSdkChat('ping');
    return {
      success: true,
      message: 'OCI SDK connection successful',
      testResponse: testResult.slice(0, 100),
    };
  } catch (e) {
    return {
      error: e.message || String(e),
      success: false,
    };
  }
}
