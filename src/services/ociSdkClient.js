// Lightweight wrapper around OCI Generative AI SDK (actions/chat)
// Uses ~/.oci/config (or env overrides) for auth via SessionAuthDetailProvider
// Env expected:
//  - OCI_REGION (e.g., us-ashburn-1)
//  - OCI_COMPARTMENT_ID (for chatDetails)
//  - OCI_MODEL_ID (On-Demand serving model OCID)
//  - Optional: OCI_SDK_CONFIG_LOCATION (defaults to ~/.oci/config)
//  - Optional: OCI_SDK_CONFIG_PROFILE (defaults to DEFAULT)

import { GenerativeAiInferenceClient } from 'oci-generativeaiinference';
import { ConfigFileAuthenticationDetailsProvider, NoRetryConfigurationDetails } from 'oci-common';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

export async function ociSdkChat(prompt) {
  try {
    const compartmentId = required('OCI_COMPARTMENT_ID');
    const modelId = required('OCI_MODEL_ID');


    // Use ConfigFileAuthenticationDetailsProvider like your working code
    const provider = new ConfigFileAuthenticationDetailsProvider();

    // Create client with explicit configuration
    const client = new GenerativeAiInferenceClient({
      authenticationDetailsProvider: provider,
      endpoint: 'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com'
    });

    // Construct request exactly like the working TypeScript example
    const chatRequest = {
      chatDetails: {
        compartmentId: compartmentId,
        servingMode: {
          modelId: modelId,
          servingType: 'ON_DEMAND'
        },
        chatRequest: {
          messages: [
            {
              role: 'USER',
              content: [
                {
                  type: 'TEXT',
                  text: prompt
                }
              ]
            }
          ],
          apiFormat: 'GENERIC',
          maxTokens: 1024,
          temperature: 0.2,
          frequencyPenalty: 0,
          presencePenalty: 0,
          topK: 1,
          topP: 0.95
        }
      },
      retryConfiguration: NoRetryConfigurationDetails
    };

    const response = await client.chat(chatRequest);


    // Extract text from the correct SDK response structure
    const text = response?.chatResult?.chatResponse?.choices?.[0]?.message?.content?.[0]?.text ||
                'No text found in response';


    return String(text);
  } catch (error) {
    console.error('[OCI] SDK Error:', error.message);

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

  const servingMode = { modelId, servingType: "ON_DEMAND" };
  const chatRequest = {
    messages: [{ role: "USER", content: [{ type: "TEXT", text: prompt }] }],
    apiFormat: "GENERIC", maxTokens: 1024, temperature: 0.2,
    frequencyPenalty: 0, presencePenalty: 0, topK: 1, topP: 0.95
  };

  const servingModeFile = '/tmp/oci-serving-mode.json';
  const chatRequestFile = '/tmp/oci-chat-request.json';

  fs.default.writeFileSync(servingModeFile, JSON.stringify(servingMode, null, 2));
  fs.default.writeFileSync(chatRequestFile, JSON.stringify(chatRequest, null, 2));

  const command = `oci generative-ai-inference chat-result chat --compartment-id "${compartmentId}" --serving-mode file://${servingModeFile} --chat-request file://${chatRequestFile}`;
  const { stdout } = await execAsync(command);

  fs.default.unlinkSync(servingModeFile);
  fs.default.unlinkSync(chatRequestFile);

  const response = JSON.parse(stdout);
  return response?.data?.[`chat-response`]?.choices?.[0]?.message?.content?.[0]?.text || 'CLI fallback failed';
}
