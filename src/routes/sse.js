import { isAuthenticated } from '../auth.js';
import { sseHub } from '../sseHub.js';

export function registerSse(app) {
  app.get('/events', (req, res) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    sseHub.add(res);

    const interval = setInterval(() => {
      try {
        sseHub.broadcastJson(JSON.stringify({ type: 'ping', ts: Date.now() }));
      } catch {}
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      sseHub.remove(res);
      try {
        res.end();
      } catch {}
    });
  });
}
