// OCI Generative AI chat helper
//
// Overview
// - Prefers OCI SDK (using local ~/.oci/config) for authentication and inference
// - Falls back to OCI CLI for chat when SDK fails (keeps developer unblocked)
//
// Required env (for both SDK and CLI paths):
//  - OCI_COMPARTMENT_ID  (chatDetails)
//  - OCI_MODEL_ID        (On-Demand serving model OCID)
// Optional env:
//  - OCI_REGION (e.g., us-ashburn-1). Defaults to us-ashburn-1
//  - OCI_SDK_CONFIG_LOCATION, OCI_SDK_CONFIG_PROFILE for SDK auth overrides

import { GenerativeAiInferenceClient } from 'oci-generativeaiinference';
import { ConfigFileAuthenticationDetailsProvider, NoRetryConfigurationDetails } from 'oci-common';

/** Ensure required environment variable exists. */
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

// Cache SDK provider and client to avoid re-initialization per request
let sdkProvider = null;
let sdkClient = null;

function endpointFromRegion() {
  const region = process.env.OCI_REGION || 'us-ashburn-1';
  return `https://inference.generativeai.${region}.oci.oraclecloud.com`;
}

export async function ociSdkChat(prompt) {
  try {
    const compartmentId = required('OCI_COMPARTMENT_ID');
    const modelId = required('OCI_MODEL_ID');

    // Lazily init SDK provider & client once
    if (!sdkProvider) {
      sdkProvider = new ConfigFileAuthenticationDetailsProvider(
        process.env.OCI_SDK_CONFIG_LOCATION,
        process.env.OCI_SDK_CONFIG_PROFILE
      );
    }
    if (!sdkClient) {
      sdkClient = new GenerativeAiInferenceClient({
        authenticationDetailsProvider: sdkProvider,
        endpoint: endpointFromRegion(),
      });
    }

    // Construct request exactly like the working TypeScript example
    const chatRequest = {
      chatDetails: {
        compartmentId: compartmentId,
        servingMode: {
          modelId: modelId,
          servingType: 'ON_DEMAND',
        },
        chatRequest: {
          messages: [
            {
              role: 'USER',
              content: [
                {
                  type: 'TEXT',
                  text: prompt,
                },
              ],
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

    const response = await sdkClient.chat(chatRequest);

    // Extract text from the correct SDK response structure
    const text =
      response?.chatResult?.chatResponse?.choices?.[0]?.message?.content?.[0]?.text ||
      'No text found in response';

    return String(text);
  } catch (error) {
    console.warn('[OCI] SDK Error:', error?.message || error);

    // If SDK fails, fall back to CLI
    return await ociCliChat(prompt);
  }
}

// Keep CLI as fallback
async function ociCliChat(prompt) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const fs = await import('fs');

  const execAsync = promisify(exec);
  const compartmentId = required('OCI_COMPARTMENT_ID');
  const modelId = required('OCI_MODEL_ID');

  const servingMode = { modelId, servingType: 'ON_DEMAND' };
  const chatRequest = {
    messages: [{ role: 'USER', content: [{ type: 'TEXT', text: prompt }] }],
    apiFormat: 'GENERIC',
    maxTokens: 1024,
    temperature: 0.2,
    frequencyPenalty: 0,
    presencePenalty: 0,
    topK: 1,
    topP: 0.95,
  };

  const servingModeFile = '/tmp/oci-serving-mode.json';
  const chatRequestFile = '/tmp/oci-chat-request.json';

  try {
    fs.default.writeFileSync(servingModeFile, JSON.stringify(servingMode, null, 2));
    fs.default.writeFileSync(chatRequestFile, JSON.stringify(chatRequest, null, 2));

    const command = `oci generative-ai-inference chat-result chat --compartment-id "${compartmentId}" --serving-mode file://${servingModeFile} --chat-request file://${chatRequestFile}`;
    const { stdout } = await execAsync(command);

    const response = JSON.parse(stdout);
    return (
      response?.data?.[`chat-response`]?.choices?.[0]?.message?.content?.[0]?.text ||
      'CLI fallback failed'
    );
  } finally {
    try {
      fs.default.unlinkSync(servingModeFile);
    } catch {}
    try {
      fs.default.unlinkSync(chatRequestFile);
    } catch {}
  }
}
