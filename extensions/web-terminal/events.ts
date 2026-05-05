import http from "node:http";

export type SseClient = http.ServerResponse;

export function sse(req: http.IncomingMessage, res: http.ServerResponse, clients: Set<SseClient>, initial: unknown) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`data: ${JSON.stringify(initial)}\n\n`);
  clients.add(res);
  const keepalive = setInterval(() => {
    if (!res.writable) {
      clearInterval(keepalive);
      clients.delete(res);
      return;
    }
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepalive);
      clients.delete(res);
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(keepalive);
    clients.delete(res);
  });
}

export function broadcast(clients: Set<SseClient>, data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    if (!res.writable) {
      clients.delete(res);
      continue;
    }
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}
