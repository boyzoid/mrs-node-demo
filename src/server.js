// Express HTTP server wiring the demo app (auth, API proxy, SSE, AI page)
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { fetch as undiciFetch } from 'undici';

if (!globalThis.fetch) globalThis.fetch = undiciFetch;

dotenv.config();

import { registerAuth, isAuthenticated } from './auth.js';
import { registerApi } from './routes/api.js';
import { registerAi } from './routes/ai.js';
import { ociProbe } from './services/explainer.js';
import { registerSse } from './routes/sse.js';
import { MrsClient } from './mrsClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev helper: allow self-signed TLS for MRS backend if explicitly enabled
if (process.env.MRS_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const PORT = process.env.PORT || 8080;
const mrs = new MrsClient({
  baseUrl: process.env.MRS_URL,
  username: process.env.MRS_USERNAME,
  password: process.env.MRS_PASSWORD,
  authApp: process.env.MRS_AUTH_APP || 'MySQL',
  sessionType: process.env.MRS_SESSION_TYPE || 'bearer',
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => res.send('Node.js + MySQL REST Service + AI'));

registerAuth(app, mrs);

// UI guards and static
// Simple UI auth guard (redirects unauthenticated users to /login)
app.use('/ui', (req, res, next) => {
  if (!isAuthenticated(req)) return res.redirect(302, '/login');
  next();
});
// Serve index directly to avoid redirect chains
app.get('/ui', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/ui/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use('/ui', express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

registerSse(app);
registerApi(app, mrs);
registerAi(app, mrs);

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`\n[shutdown] received ${signal}, closing server...`);
  try {
    server.close(() => {
      console.log('[shutdown] HTTP server closed');
      process.exit(0);
    });
    // Force-exit if close hangs
    setTimeout(() => {
      console.warn('[shutdown] Force exiting after timeout');
      process.exit(0);
    }, 5000).unref();
  } catch (e) {
    console.error('[shutdown] error:', e?.message || e);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Debug endpoint to verify OCI configuration and endpoint mapping
app.get('/_debug/oci', async (req, res) => {
  try {
    const out = await ociProbe();
    res.type('application/json').send(out);
  } catch (e) {
    res
      .status(500)
      .type('application/json')
      .send({ error: e?.message || String(e) });
  }
});
