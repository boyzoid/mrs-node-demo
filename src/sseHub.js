export const sseHub = {
  clients: new Set(),
  add(res) {
    this.clients.add(res);
    try {
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    } catch {}
  },
  remove(res) {
    this.clients.delete(res);
  },
  broadcastJson(json) {
    for (const res of Array.from(this.clients)) {
      try {
        res.write(`data: ${json}\n\n`);
      } catch {
        this.clients.delete(res);
      }
    }
  },
};
