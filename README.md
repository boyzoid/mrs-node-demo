# node-mrs-ai

Node.js port of the Helidon demo. Provides:

- Auth with bcrypt against MRS `/sakila/users/`
- Actors CRUD via MRS proxy
- Server-Sent Events broadcast on changes
- Static UI under `/ui`
- AI explain endpoint stub under `/ai/actors/:id/explain`

## Prerequisites

- Node.js 18+
- Access to MySQL REST Service (MRS)

## Setup

1. Copy env template and configure MRS endpoint and credentials

   cp .env.template .env

   # edit .env

2. Install deps

   npm install

3. Run

   npm start

Open http://localhost:8080/login then go to /ui

## Running foreground vs background

Foreground (logs in your terminal, stop with Ctrl+C):

- Development: `npm run dev`
- Development with auto-restart on file changes: `npm run dev:watch`
- Development with auth debug logs: `DEBUG_AUTH=1 npm run dev`
- Production-like: `npm start`

Background helpers (detach, manage with PID file and logs/):

- Start in background (prod): `npm run start:bg`
- Start in background (dev + DEBUG_AUTH): `npm run dev:bg`
- Check status: `npm run status`
- View logs: `npm run logs`
- Stop background process: `npm run stop`

Tips:

- Change port: `PORT=8081 npm run dev`
- If a foreground command returns immediately and you see no logs, a process may already be listening on the port. Check with:
  - `lsof -nP -iTCP:8080 -sTCP:LISTEN`
  - If found, stop it with `npm run stop` (if started via background script) or kill the PID.
- IntelliJ IDEA: You can run in the built-in Terminal for full logs, or create a Run Configuration (Node.js) with `src/server.js` and environment variables from `.env`.

## Notes

- If your MRS uses self-signed certs, MRS_INSECURE_TLS=true will disable TLS verification for MRS calls.
- The AI endpoint currently returns a basic HTML summary without calling an LLM. You can wire OCI GenAI by implementing a client in `src/services/explainer.js` using your OCI\_\* env vars.
## Enabling OCI Generative AI (optional)

This project can call OCI Generative AI (actions/chat) to summarize actors on the /ai page.

Current implementation prefers the OCI SDK (using your local ~/.oci/config), and falls back to the OCI CLI if the SDK call fails. Configure the following (see .env.template):

Required:
- OCI_COMPARTMENT_ID
- OCI_MODEL_ID (On-Demand serving model OCID)

Optional:
- OCI_REGION (defaults to us-ashburn-1)
- OCI_SDK_CONFIG_LOCATION and OCI_SDK_CONFIG_PROFILE (if you don't want the defaults of ~/.oci/config and DEFAULT)

How it works:
- src/services/explainer.js checks minimal required env. If present, it calls ociSdkChat(prompt) from src/services/ociSdkClient.js
- ociSdkClient builds a GenerativeAiInferenceClient with a ConfigFileAuthenticationDetailsProvider and calls chat().
- If the SDK errors, it falls back to running the oci CLI once to perform the same request.

Testing:
1) Ensure you can run `oci session validate` or otherwise have a working ~/.oci/config profile.
2) Set OCI_COMPARTMENT_ID and OCI_MODEL_ID in your environment (.env) and restart the server.
3) Visit /ui and click an actor’s AI Summary link. If you see an error, open the server logs for details.

Security tips:
- Do not commit private keys or ~/.oci/config.
- If using HTTPS proxies or self-signed certs, verify you are not intercepting traffic to OCI endpoints.

Security tips:

- Do not commit private keys. Prefer OCI_PRIVATE_KEY_PATH in local dev, or use a secrets manager in production.
- If calling through proxies, ensure HTTPS to the OCI endpoint is not intercepted.
