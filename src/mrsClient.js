export class MrsClient {
  constructor({ baseUrl, username, password, authApp = 'MySQL', sessionType = 'bearer' }) {
    if (!baseUrl) throw new Error('Missing MRS_URL');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.authApp = authApp;
    this.sessionType = sessionType;
    this.bearer = null;
  }

  headers() {
    const h = { Accept: 'application/json' };
    if (this.bearer) h['Authorization'] = this.bearer;
    return h;
  }

  async loginIfPossible() {
    if (this.bearer || !this.username || !this.password || !this.authApp) return;
    if (this.authApp !== 'MySQL') {
      throw new Error('MySQL Rest Service requires MRS_AUTH_APP=MySQL');
    }
    const loginUrl = this.baseUrl + '/authentication/login';
    console.log('[MRS] POST', loginUrl);
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        authApp: this.authApp,
        sessionType: this.sessionType,
      }),
    });
    const body = await res.text();
    try {
      const json = JSON.parse(body);
      if (json.accessToken) this.bearer = 'Bearer ' + json.accessToken;
      else throw new Error('No accessToken in response');
    } catch {
      throw new Error('Login failed: ' + body);
    }
  }

  async withAuthRetry(doRequest) {
    let res = await doRequest();
    if (res.status === 401) {
      this.bearer = null;
      await this.loginIfPossible();
      res = await doRequest();
    }
    return res;
  }

  rawQueryFrom(req) {
    const i = req.originalUrl.indexOf('?');
    return i >= 0 ? req.originalUrl.slice(i + 1) : '';
  }

  async get(path, rawQuery) {
    const url = this.baseUrl + path + (rawQuery ? (path.includes('?') ? '&' : '?') + rawQuery : '');
    console.log('[MRS] GET', url);
    await this.loginIfPossible();
    const res = await this.withAuthRetry(() => fetch(url, { headers: this.headers() }));
    return await res.text();
  }

  async patchJson(path, body) {
    const url = this.baseUrl + path;
    console.log('[MRS] PATCH', url);
    await this.loginIfPossible();
    const res = await this.withAuthRetry(() =>
      fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body,
      })
    );
    return await res.text();
  }

  async putJson(path, body) {
    const url = this.baseUrl + path;
    console.log('[MRS] PUT', url);
    await this.loginIfPossible();
    const res = await this.withAuthRetry(() =>
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.headers() },
        body,
      })
    );
    return await res.text();
  }

  async delete(path) {
    const url = this.baseUrl + path;
    console.log('[MRS] DELETE', url);
    await this.loginIfPossible();
    const res = await this.withAuthRetry(() =>
      fetch(url, { method: 'DELETE', headers: this.headers() })
    );
    return await res.text();
  }
}
