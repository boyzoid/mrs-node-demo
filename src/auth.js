import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LoginPage = {
  html(error) {
    const err = error
      ? `<div class="alert alert-danger" role="alert"><strong>${escapeHtml(error)}</strong></div>`
      : '';
    return `
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8"/>
              <meta name="viewport" content="width=device-width,initial-scale=1"/>
              <title>Sign in</title>
              <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
              <link rel="icon" href="data:,">
              <style>
                .page{max-width:420px;margin-top:10vh}
              </style>
            </head>
            <body class="bg-body-tertiary">
              <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
                <div class="container">
                  <a class="navbar-brand" href="/ui/">MySQL REST Service Demo</a>
                </div>
              </nav>
              <main class="container page">
                <div class="card shadow-sm">
                  <div class="card-body">
                    <h1 class="h3">Sign in</h1>
                    <p class="text-body-secondary">Access the MySQL REST Service UI</p>
                    ${err}
                    <form method="post" action="/auth/login" class="vstack gap-3">
                      <div>
                        <label class="form-label">Username</label>
                        <input class="form-control" name="username" autocomplete="username" required>
                      </div>
                      <div>
                        <label class="form-label">Password</label>
                        <input class="form-control" type="password" name="password" autocomplete="current-password" required>
                      </div>
                      <div>
                        <button class="btn btn-primary w-100" type="submit">Sign in</button>
                      </div>
                    </form>
                  </div>
                </div>
              </main>
            </body>
            </html>`;
  },
};

// Simple cookie/session management for demo purposes. In production, prefer a
// durable session store and set `COOKIE_SECURE=true` when served over HTTPS.

export const SESSION_COOKIE = 'SESSION';
const SESSIONS = new Map();
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // Enable secure cookies when explicitly configured (behind HTTPS/proxy)
  secure: process.env.COOKIE_SECURE === 'true',
};

export function isAuthenticated(req) {
  const sid = req.cookies?.[SESSION_COOKIE];
  const ok = !!(sid && SESSIONS.has(sid));
  if (process.env.DEBUG_AUTH === '1') {
    try {
      const short = sid ? String(sid).slice(0, 8) + '…' : 'none';
      console.log(
        '[auth] isAuthenticated',
        req.method,
        req.originalUrl,
        'sid:',
        short,
        'inMap:',
        sid ? SESSIONS.has(sid) : false
      );
    } catch {}
  }
  return ok;
}

function newSession(username) {
  const id = randomBytes(24).toString('base64url');
  SESSIONS.set(id, username);
  if (process.env.DEBUG_AUTH === '1') {
    try {
      console.log(
        '[auth] newSession for',
        username,
        'sid:',
        String(id).slice(0, 8) + '…',
        'sessions:',
        SESSIONS.size
      );
    } catch {}
  }
  return id;
}

function findFirstPasswordHash(jsonText) {
  try {
    const obj = JSON.parse(jsonText);
    const item = obj?.items?.[0] || obj?.data?.[0] || obj;
    return item?.passwordHash || item?.password_hash || null;
  } catch {
    const m = /"(passwordHash|password_hash)"\s*:\s*"([^"]+)"/.exec(jsonText);
    return m ? m[2] : null;
  }
}

export function registerAuth(app, mrs) {
  app.get('/login', (req, res) => {
    if (isAuthenticated(req)) return res.redirect(302, '/ui');
    res.set('Content-Type', 'text/html; charset=utf-8').send(LoginPage.html(null));
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const username = String(req.body?.username || '');
      const password = String(req.body?.password || '');
      if (!username || !password) {
        return res
          .status(400)
          .set('Content-Type', 'text/html; charset=utf-8')
          .send(LoginPage.html('Please enter username and password.'));
      }
      if (process.env.DEBUG_AUTH === '1') {
        try {
          console.log('[auth] login attempt for user:', username);
        } catch {
          // ignore debug logging errors
        }
      }

      const q = encodeURIComponent(JSON.stringify({ username: { $eq: username } }));
      const rawQ = 'q=' + q + '&limit=1';
      const jsonText = await mrs.get('/sakila/users/', rawQ);
      if (process.env.DEBUG_AUTH === '1') {
        try {
          const sample = (jsonText || '').slice(0, 160).replace(/\n/g, ' ');
          console.log('[auth] users lookup raw length:', (jsonText || '').length, 'sample:', sample);
        } catch {
          // ignore debug logging errors
        }
      }

      const storedHash = findFirstPasswordHash(jsonText)?.trim();
      let ok = false;
      if (storedHash) {
        try {
          ok = await bcrypt.compare(password, storedHash);
        } catch {}
      }
      if (process.env.DEBUG_AUTH === '1') {
        try {
          console.log('[auth] compare result:', ok, 'hashPresent:', !!storedHash);
        } catch {
          // ignore debug logging errors
        }
      }
      if (!ok) {
        return res
          .status(401)
          .set('Content-Type', 'text/html; charset=utf-8')
          .send(LoginPage.html('Invalid credentials.'));
      }

      const sid = newSession(username);
      res.cookie(SESSION_COOKIE, sid, { ...COOKIE_BASE, maxAge: 8 * 60 * 60 * 1000 });
      if (process.env.DEBUG_AUTH === '1') {
        try {
          console.log('[auth] login OK for', username, 'sid set');
        } catch {
          // ignore debug logging errors
        }
      }
      return res.redirect(302, '/ui');
    } catch (e) {
      if (process.env.DEBUG_AUTH === '1') {
        try {
          console.log('[auth] login error:', e && e.message ? e.message : e);
        } catch {
          // ignore debug logging errors
        }
      }
      return res.status(500).send('Login error: ' + (e?.message || String(e)));
    }
  });

  app.get('/auth/logout', (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) SESSIONS.delete(sid);
    res.cookie(SESSION_COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
    res.redirect(302, '/login');
  });

  app.get('/_debug/hash', (req, res) => {
    const pwd = req.query?.pwd;
    if (!pwd) return res.status(400).send('Usage: /_debug/hash?pwd=yourPassword');
    const h = bcrypt.hashSync(String(pwd), 12);
    res.send(h);
  });

  // Debug helpers
  app.get('/_debug/whoami', (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE] || null;
    res.type('application/json').send({
      url: req.originalUrl,
      sid: sid ? String(sid).slice(0, 8) + '…' : null,
      hasSession: sid ? SESSIONS.has(sid) : false,
      cookiePresent: !!sid,
      cookies: Object.keys(req.cookies || {}),
    });
  });

  app.get('/_debug/cookies', (req, res) => {
    res.type('text/plain').send(String(req.headers['cookie'] || 'no cookie header'));
  });

  // Dev-only: force login as a given user and set cookie
  app.get('/_debug/loginAs', (req, res) => {
    const u = String(req.query?.u || 'dev');
    const sid = newSession(u);
    res.cookie(SESSION_COOKIE, sid, { ...COOKIE_BASE, maxAge: 8 * 60 * 60 * 1000 });
    res.redirect(302, '/ui');
  });
}
