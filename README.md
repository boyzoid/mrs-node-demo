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

1) Copy env template and configure MRS endpoint and credentials

   cp .env.template .env
   # edit .env

2) Install deps

   npm install

3) Run

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
- The AI endpoint currently returns a basic HTML summary without calling an LLM. You can wire OCI GenAI by implementing a client in `src/services/explainer.js` using your OCI_* env vars.
  
## Enabling OCI Generative AI (optional)

This project can call OCI Generative AI to summarize actors on the /ai page. Configure the following environment variables (see .env.template):

Required:
- OCI_REGION (e.g., us-ashburn-1)
- OCI_COMPARTMENT_ID
- OCI_MODEL_NAME (e.g., meta.llama-3.3-70b-instruct)
- OCI_TENANCY_OCID
- OCI_USER_OCID
- OCI_FINGERPRINT
- One of:
  - OCI_PRIVATE_KEY_PEM (inline PEM; escape newlines as \n)
  - OCI_PRIVATE_KEY_PATH (path to oci_api_key.pem)

How it works:
- src/services/explainer.js detects OCI_* env. If present, it signs requests with OCI Request Signing and calls:
  - POST https://inference.generativeai.${OCI_REGION}.oci.oraclecloud.com/2024-10-30/chat/completions?compartmentId=${OCI_COMPARTMENT_ID}
  - Body uses `model=OCI_MODEL_NAME` and a short system/user prompt.
- On success, the AI summary is shown inside the card. On error, a concise error is rendered.

Testing:
1) Fill in the OCI_* vars in .env (or export in your shell) and restart the server.
2) Visit /ui and click an actor’s AI Summary link.
3) If you see an error, check the server logs for "OCI GenAI error" details. Common issues: wrong compartmentId, model name, or key config.

Security tips:
- Do not commit private keys. Prefer OCI_PRIVATE_KEY_PATH in local dev, or use a secrets manager in production.
- If calling through proxies, ensure HTTPS to the OCI endpoint is not intercepted.
