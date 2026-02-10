/**
 * Minimal in-memory hub to fan out Server-Sent Events (SSE) to connected clients.
 * Store Express Response objects and write `data:` lines to broadcast messages.
 */
export const sseHub = {
  /** @type {Set<import('express').Response>} */
  clients: new Set(),

  /** Register a client connection and send initial event. */
  add(res) {
    this.clients.add(res);
    try {
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    } catch {}
  },

  /** Remove a client (e.g., on close). */
  remove(res) {
    this.clients.delete(res);
  },

  /** Broadcast a pre-serialized JSON string to all clients. */
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
