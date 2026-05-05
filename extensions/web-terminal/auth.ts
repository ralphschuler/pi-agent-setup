import http from "node:http";

export function cookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

export function isAuthed(req: http.IncomingMessage, url: URL, token: string) {
  return url.searchParams.get("token") === token || cookieValue(req.headers.cookie, "pi_web_terminal_token") === token;
}

export function isTrustedOrigin(req: http.IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin || Array.isArray(origin)) return !Array.isArray(origin);

  const host = req.headers.host;
  if (!host || Array.isArray(host)) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === "http:" && originUrl.host === host;
  } catch {
    return false;
  }
}

export function requiresCsrfCheck(req: http.IncomingMessage, url: URL) {
  const method = req.method || "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return url.searchParams.get("token") === null && cookieValue(req.headers.cookie, "pi_web_terminal_token") !== undefined;
}
