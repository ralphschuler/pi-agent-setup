import fs from "node:fs";
import path from "node:path";
import { isLanBindHost } from "./local-network.ts";

export const DEFAULT_SAFE_TEXT_FILE_MAX_BYTES = 256 * 1024;
export const WEB_TERMINAL_READ_MAX_BYTES = 512 * 1024;

const protectedSecretPathPatterns = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])\.npmrc$/i,
  /(^|[/\\])\.pypirc$/i,
  /(^|[/\\])credentials(?:\.|$)/i,
  /(^|[/\\])id_rsa$/i,
  /(^|[/\\])id_dsa$/i,
  /(^|[/\\])id_ecdsa$/i,
  /(^|[/\\])id_ed25519$/i,
  /(^|[/\\]).*private[_-]?key.*$/i,
  /(^|[/\\]).*private-key.*$/i,
  /(^|[/\\]).*secret.*$/i,
];

const protectedSystemPathPatterns = [/^(?:\/etc|\/var|\/usr|\/bin|\/sbin|\/boot|\/dev|\/proc|\/sys)\b/, /^(?:~\/\.ssh|\$HOME\/\.ssh)\b/];

const destructiveTargets = new Set(["/", "/*", "/.", "/..", "~", "~/", "$HOME", "${HOME}"]);
const dangerousPatterns = [/\bsudo\s+rm\b/, /\bmkfs(?:\.|\s)/, /\bdd\s+if=.*\sof=\/dev\//];

export function normalizeRelativePath(inputPath: string) {
  let normalized = inputPath.trim().replace(/^@/, "").replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

export function isProtectedSecretPath(inputPath: string) {
  const normalized = normalizeRelativePath(inputPath);
  return protectedSecretPathPatterns.some((pattern) => pattern.test(normalized));
}

export function isProtectedSystemPath(inputPath: string) {
  const normalized = String(inputPath || "")
    .trim()
    .replaceAll("\\", "/");
  return protectedSystemPathPatterns.some((pattern) => pattern.test(normalized));
}

export function resolveInsideRoot(root: string, requestedPath: string) {
  const safeRoot = path.resolve(root);
  const resolved = path.resolve(safeRoot, requestedPath || ".");
  if (!isInsideRoot(safeRoot, resolved)) return null;
  return resolved;
}

export function resolveExistingInsideRoot(root: string, requestedPath: string) {
  const safeRoot = path.resolve(root);
  const resolved = resolveInsideRoot(safeRoot, requestedPath);
  if (!resolved) return null;
  try {
    const real = fs.realpathSync(resolved);
    if (!isInsideRoot(safeRoot, real)) return null;
    return real;
  } catch {
    return resolved;
  }
}

export function resolveWritableInsideRoot(root: string, requestedPath: string) {
  const safeRoot = path.resolve(root);
  const resolved = resolveInsideRoot(safeRoot, requestedPath);
  if (!resolved) return null;

  let current = safeRoot;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(safeRoot);
  } catch {
    return null;
  }

  const relative = path.relative(safeRoot, resolved);
  for (const part of relative ? relative.split(path.sep) : []) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return null;
      const real = fs.realpathSync(current);
      if (!isInsideRoot(realRoot, real)) return null;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") break;
      return null;
    }
  }

  return resolved;
}

export function isBinaryBuffer(buffer: Buffer) {
  if (buffer.includes(0)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length > 0.1;
}

export function assertSafeTextContent(content: string, relativePath: string, maxBytes = DEFAULT_SAFE_TEXT_FILE_MAX_BYTES) {
  const bytes = Buffer.byteLength(content);
  if (bytes > maxBytes) throw new Error(`Large content denied: ${relativePath} (${bytes} bytes)`);
  if (isBinaryBuffer(Buffer.from(content))) throw new Error(`Binary content denied: ${relativePath}`);
}

export function dangerousShellReason(command: string) {
  const pattern = dangerousPatterns.find((candidate) => candidate.test(command));
  if (pattern) return String(pattern);
  return hasDangerousRm(command) ? "destructive rm target" : undefined;
}

export function isPackageInstallCommand(command: string) {
  return /\b(npm|pnpm|yarn|bun)\s+(?:add|install|i)\b/.test(command) || /\bpip(?:3)?\s+install\b/.test(command);
}

export function exposesNetwork(command: string) {
  return extractOptionHosts(command, ["--host", "--listen"]).some(isLanBindHost) || /\b(?:0\.0\.0\.0|\[?::\]?):\d+\b/.test(command);
}

function extractOptionHosts(command: string, optionNames: string[]) {
  const tokens = shellWords(command);
  const hosts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    for (const option of optionNames) {
      if (token === option && tokens[i + 1]) hosts.push(stripPort(tokens[i + 1]));
      else if (token.startsWith(`${option}=`)) hosts.push(stripPort(token.slice(option.length + 1)));
    }
  }
  return hosts;
}

function stripPort(value: string) {
  const trimmed = value.trim();
  const bracketed = /^\[([^\]]+)](?::\d+)?$/.exec(trimmed);
  if (bracketed) return bracketed[1];
  return trimmed.replace(/:\d+$/, "");
}

function hasDangerousRm(command: string) {
  const tokens = shellWords(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = basename(tokens[i]);
    if (token !== "rm") continue;

    let recursive = false;
    let force = false;
    let parsingOptions = true;
    for (let j = i + 1; j < tokens.length; j++) {
      const arg = tokens[j];
      if (parsingOptions && arg === "--") {
        parsingOptions = false;
        continue;
      }
      if (parsingOptions && arg.startsWith("-") && arg !== "-") {
        if (arg.includes("r") || arg.includes("R") || arg === "--recursive") recursive = true;
        if (arg.includes("f") || arg === "--force") force = true;
        continue;
      }
      if (recursive && force && isDangerousRmTarget(arg)) return true;
      if ([";", "&&", "||", "|"].includes(arg)) break;
    }
  }
  return false;
}

function isDangerousRmTarget(target: string) {
  const normalized = target.replace(/\/+$/, "") || "/";
  return destructiveTargets.has(target) || destructiveTargets.has(normalized) || normalized.startsWith("/dev/") || normalized === "/*";
}

function basename(value: string) {
  return value.split("/").pop() || value;
}

function shellWords(command: string) {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = "";
      continue;
    }
    if ((ch === "&" || ch === "|") && command[i + 1] === ch) {
      if (current) words.push(current);
      words.push(`${ch}${ch}`);
      current = "";
      i++;
      continue;
    }
    if (ch === ";" || ch === "|") {
      if (current) words.push(current);
      words.push(ch);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) words.push(current);
  return words;
}

function isInsideRoot(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}
