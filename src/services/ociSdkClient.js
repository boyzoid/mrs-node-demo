// Lightweight wrapper around OCI Generative AI SDK (actions/chat)
// Uses ~/.oci/config (or env overrides) for auth via SessionAuthDetailProvider
// Env expected:
//  - OCI_REGION (e.g., us-ashburn-1)
//  - OCI_COMPARTMENT_ID (for chatDetails)
//  - OCI_MODEL_ID (On-Demand serving model OCID)
//  - Optional: OCI_SDK_CONFIG_LOCATION (defaults to ~/.oci/config)
//  - Optional: OCI_SDK_CONFIG_PROFILE (defaults to DEFAULT)

import { GenerativeAiInferenceClient } from 'oci-generativeaiinference';
import { SessionAuthDetailProvider, NoRetryConfigurationDetails } from 'oci-common';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

export async function ociSdkChat(prompt) {
  const region = required('OCI_REGION');
  const compartmentId = required('OCI_COMPARTMENT_ID');
  const modelId = required('OCI_MODEL_ID');
  const configLocation = process.env.OCI_SDK_CONFIG_LOCATION || process.env.HOME + '/.oci/config';
  const configProfile = process.env.OCI_SDK_CONFIG_PROFILE || 'DEFAULT';

  const provider = new SessionAuthDetailProvider(configLocation, configProfile);
  const client = new GenerativeAiInferenceClient({ authenticationDetailsProvider: provider });
  client.endpoint = `https://inference.generativeai.${region}.oci.oraclecloud.com`;

  const chatRequest = {
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
        maxTokens: 1024,
        temperature: 0.2,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topK: 1,
        topP: 0.95,
      },
    },
    retryConfiguration: NoRetryConfigurationDetails,
  };

  const resp = await client.chat(chatRequest);

  // Best-effort extraction of text content; fallback to JSON
  try {
    const o = resp;
    const text = o?.chatResult?.output?.[0]?.content?.[0]?.text
      || o?.chatResult?.outputText
      || o?.data?.chatResult?.output?.[0]?.content?.[0]?.text
      || o?.data?.chatResult?.outputText;
    return String(text || JSON.stringify(resp));
  } catch {
    return JSON.stringify(resp);
  }
}
