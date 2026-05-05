import http from "node:http";

export function send(res: http.ServerResponse, status: number, contentType: string, body: string) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

export function json(res: http.ServerResponse, status: number, data: unknown) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(data));
}

export function readBody(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function safeHandleApi(res: http.ServerResponse, handler: () => Promise<void> | void) {
  try {
    await handler();
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    const message = error instanceof SyntaxError ? "Malformed JSON" : error instanceof Error ? error.message : String(error);
    json(res, status, { error: message });
  }
}
