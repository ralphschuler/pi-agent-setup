import os from "node:os";

export const LOCALHOST_BIND_HOST = "127.0.0.1";

export function env(name: string) {
  const exact = process.env[name];
  if (exact !== undefined) return exact;
  const match = Object.keys(process.env).find((key) => key.toUpperCase() === name);
  return match ? process.env[match] : undefined;
}

export function normalizeHost(value: unknown) {
  const host = typeof value === "string" ? value.trim() : "";
  if (!host) return undefined;
  if (!/^[a-zA-Z0-9:._-]+$/.test(host)) throw new Error("Invalid host. Use an IP address or hostname.");
  return host;
}

export function normalizePort(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port. Use 1-65535.");
  return port;
}

export function isLocalhostHost(host: string) {
  return host === LOCALHOST_BIND_HOST || host === "localhost" || host === "::1";
}

export function isLanBindHost(host: string) {
  return host === "0.0.0.0" || host === "::";
}

export function localNetworkUrls(port: number, host = LOCALHOST_BIND_HOST, protocol = "http") {
  const addresses = [`${protocol}://localhost:${port}`];
  if (isLanBindHost(host)) {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) addresses.push(`${protocol}://${entry.address}:${port}`);
      }
    }
  } else if (!isLocalhostHost(host)) {
    addresses.push(`${protocol}://${host}:${port}`);
  }
  return [...new Set(addresses)];
}
