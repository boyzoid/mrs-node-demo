import { isAuthenticated } from './auth.js';

export function registerRoutes(app, mrs) {
  // API Routes
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

  // Single
  app.get('/api/actors/:id', async (req, res) => {
    const body = await mrs.get('/sakila/actor/' + encodeURIComponent(req.params.id), null);
    res.type('application/json').send(body);
  });

  // Create / Update / Delete
  app.post('/api/actors', async (req, res) => {
    const body = await mrs.postJson('/sakila/actor/', JSON.stringify(req.body));
    res.type('application/json').send(body);
  });

  app.put('/api/actors/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    console.log('[API] PUT /api/actors/' + req.params.id, 'body:', req.body);
    const body = await mrs.putJson('/sakila/actor/' + id, JSON.stringify(req.body));
    console.log('[API] MRS response:', body);
    res.type('application/json').send(body);
  });

  app.delete('/api/actors/:id', async (req, res) => {
    const id = encodeURIComponent(req.params.id);
    const body = await mrs.delete('/sakila/actor/' + id);
    res.type('application/json').send(body);
  });

}