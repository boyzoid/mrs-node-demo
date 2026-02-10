import { isAuthenticated } from '../auth.js';
import { sseHub } from '../sseHub.js';

export function registerApi(app, mrs) {
  // Gate all /api/**
  app.use('/api', (req, res, next) => {
    if (!isAuthenticated(req)) return res.status(401).send('Unauthorized');
    next();
  });

  // Collection
  app.get('/api/actors', async (req, res) => {
    const body = await mrs.get('/sakila/actor/', mrs.rawQueryFrom(req));
    res.type('application/json').send(body);
  });
  app.get('/api/actors/', async (req, res) => {
    const body = await mrs.get('/sakila/actor/', mrs.rawQueryFrom(req));
    res.type('application/json').send(body);
  });

  // Single
  app.get('/api/actors/:id', async (req, res) => {
    const body = await mrs.get('/sakila/actor/' + encodeURIComponent(req.params.id), null);
    res.type('application/json').send(body);
  });

  // Create / Update / Delete
  app.post('/api/actors', async (req, res) => {
    const body = await mrs.postJson('/sakila/actor/', JSON.stringify(req.body));
    try {
      sseHub.broadcastJson('{"type":"actor.changed","op":"create"}');
    } catch {}
    res.type('application/json').send(body);
  });

  app.patch('/api/actors/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    const body = await mrs.patchJson('/sakila/actor/' + id, JSON.stringify(req.body));
    try {
      sseHub.broadcastJson(
        `{"type":"actor.changed","op":"patch","id":${JSON.stringify(req.params.id)}}`
      );
    } catch {}
    res.type('application/json').send(body);
  });

  app.put('/api/actors/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    const body = await mrs.putJson('/sakila/actor/' + id, JSON.stringify(req.body));
    try {
      sseHub.broadcastJson(
        `{"type":"actor.changed","op":"put","id":${JSON.stringify(req.params.id)}}`
      );
    } catch {}
    res.type('application/json').send(body);
  });

  app.delete('/api/actors/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    const body = await mrs.delete('/sakila/actor/' + id);
    try {
      sseHub.broadcastJson(
        `{"type":"actor.changed","op":"delete","id":${JSON.stringify(req.params.id)}}`
      );
    } catch {}
    res.type('application/json').send(body);
  });
}
