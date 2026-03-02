// AI page endpoint: streams a minimal shell immediately, then injects
// AI-generated HTML once it's ready. Uses safe escaping before injection.
import { isAuthenticated } from '../auth.js';
import { buildAiHtml } from '../services/explainer.js';

export function registerAi(app, mrs) {
  app.get('/ai/actors/:id/explain', async (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');

    res.set('Cache-Control', 'no-cache, no-transform');
    res.set('X-Accel-Buffering', 'no');
    res.set('Content-Type', 'text/html; charset=utf-8');

    const shell = `
                <!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Explaining actor…</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
  :root { color-scheme: light dark; }
  body.loading { min-height: 100svh; display: grid; place-items: center; }
  #app.loading { color: var(--bs-secondary-color); display:flex; align-items:center; gap:.75rem; }
  .spinner-border{ width:1.75rem; height:1.75rem; }
  pre{white-space:pre-wrap}
</style>
<body class="bg-body-tertiary loading">
  <div id="app" class="loading" role="status" aria-live="polite">
    <div class="spinner-border text-secondary" role="status" aria-hidden="true"></div>
    <span>Generating explanation…</span>
  </div>
</body>`;

    res.write(shell + ' '.repeat(2048));

    try {
      const id = req.params.id;
      const actorJson = await mrs.get('/sakila/actor/' + encodeURIComponent(id), null);
      const html = await buildAiHtml(actorJson);
      const safe = html
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/<\/script>/g, '<\\/script>');
      const inject = `
                <script>
                  const target = document.getElementById('app');
                  document.body.classList.remove('loading');
                  target.classList.remove('loading');
                  target.innerHTML = \`${safe}\`;
                </script>`;
      res.write(inject);
    } catch (e) {
      res.write(`<pre>AI explain error: ${e.message}</pre>`);
    } finally {
      res.end();
    }
  });
}
