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

function isSameHttpHost(value: string, host: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.host === host;
  } catch {
    return false;
  }
}

export function isTrustedOrigin(req: http.IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin || Array.isArray(origin)) return !Array.isArray(origin);

  const host = req.headers.host;
  if (!host || Array.isArray(host)) return false;

  return isSameHttpHost(origin, host);
}

export function hasTrustedCsrfOrigin(req: http.IncomingMessage) {
  const host = req.headers.host;
  if (!host || Array.isArray(host)) return false;

  const origin = req.headers.origin;
  if (Array.isArray(origin)) return false;
  if (origin) return isSameHttpHost(origin, host);

  const referer = req.headers.referer;
  if (!referer || Array.isArray(referer)) return false;
  return isSameHttpHost(referer, host);
}

export function requiresCsrfCheck(req: http.IncomingMessage, url: URL, token: string) {
  const method = req.method || "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (url.searchParams.get("token") === token) return false;
  return cookieValue(req.headers.cookie, "pi_web_terminal_token") !== undefined;
}
