import bcrypt from 'bcryptjs';
import { LoginPage } from './loginPage.js';
import { randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'SESSION';
const SESSIONS = new Map();

export function isAuthenticated(req) {
  const sid = req.cookies?.[SESSION_COOKIE];
  const ok = !!(sid && SESSIONS.has(sid));
  if (process.env.DEBUG_AUTH === '1') {
    try {
      const short = sid ? String(sid).slice(0, 8) + '…' : 'none';
      console.log('[auth] isAuthenticated', req.method, req.originalUrl, 'sid:', short, 'inMap:', sid ? SESSIONS.has(sid) : false);
    } catch {}
  }
  return ok;
}

function newSession(username) {
  const id = randomBytes(24).toString('base64url');
  SESSIONS.set(id, username);
  if (process.env.DEBUG_AUTH === '1') {
    try { console.log('[auth] newSession for', username, 'sid:', String(id).slice(0, 8) + '…', 'sessions:', SESSIONS.size); } catch {}
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
        try { console.log('[auth] login attempt for user:', username); } catch {}
      }

      const q = encodeURIComponent(JSON.stringify({ username: { $eq: username } }));
      const rawQ = 'q=' + q + '&limit=1';
      const jsonText = await mrs.get('/sakila/users/', rawQ);
      if (process.env.DEBUG_AUTH === '1') {
        try {
          const sample = (jsonText || '').slice(0, 160).replace(/\n/g, ' ');
          console.log('[auth] users lookup raw length:', (jsonText || '').length, 'sample:', sample);
        } catch {}
      }

      const storedHash = findFirstPasswordHash(jsonText)?.trim();
      let ok = false;
      if (storedHash) {
        try {
          ok = await bcrypt.compare(password, storedHash);
        } catch {}
      }
      if (process.env.DEBUG_AUTH === '1') {
        try { console.log('[auth] compare result:', ok, 'hashPresent:', !!storedHash); } catch {}
      }
      if (!ok) {
        return res
          .status(401)
          .set('Content-Type', 'text/html; charset=utf-8')
          .send(LoginPage.html('Invalid credentials.'));
      }

      const sid = newSession(username);
      res.cookie(SESSION_COOKIE, sid, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60 * 1000,
      });
      if (process.env.DEBUG_AUTH === '1') {
        try { console.log('[auth] login OK for', username, 'sid set'); } catch {}
      }
      return res.redirect(302, '/ui');
    } catch (e) {
      if (process.env.DEBUG_AUTH === '1') {
        try { console.log('[auth] login error:', e && e.message ? e.message : e); } catch {}
      }
      return res.status(500).send('Login error: ' + e.message);
    }
  });

  app.get('/auth/logout', (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (sid) SESSIONS.delete(sid);
    res.cookie(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
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
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.redirect(302, '/ui');
  });
}
