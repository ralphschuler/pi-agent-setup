import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const MIN_SECRET_LENGTH = 8;
const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "secret-redaction.json");
const SECRET_NAME_PATTERN = /(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|auth|credential|cookie)/i;
const EXCLUDED_ENV_PATTERN = /^(npm_config_|npm_package_|npm_lifecycle_|PATH$|HOME$|SHELL$|PWD$|OLDPWD$|USER$|LOGNAME$|TERM$)/i;
const REDACTION = "[REDACTED]";

type SecretSource = "env" | "config";

type SecretMatcher = {
  source: SecretSource;
  category: string;
  values: string[];
  patterns: RegExp[];
};

export type RedactionReport = {
  redactions: number;
  sources: Record<string, number>;
  categories: Record<string, number>;
};

export type SecretRedactor = {
  redactText(text: string): string;
  redactValue<T>(value: T): T;
  report(): RedactionReport;
  matcherCount(): number;
};

type ExplicitConfig = {
  values?: unknown[];
  patterns?: unknown[];
};

export default function secretRedaction(pi: ExtensionAPI) {
  const redactor = createSecretRedactor();

  pi.on("context", async (event) => ({ messages: redactor.redactValue(event.messages) }));
  pi.on("before_provider_request", async (event) => redactor.redactValue(event.payload));
}

export function createSecretRedactor(env: NodeJS.ProcessEnv = process.env, configPath = CONFIG_PATH): SecretRedactor {
  const report: RedactionReport = { redactions: 0, sources: {}, categories: {} };
  const matchers = [...secretMatchersFromEnv(env), ...secretMatchersFromConfig(configPath)];

  const record = (matcher: SecretMatcher) => {
    report.redactions += 1;
    report.sources[matcher.source] = (report.sources[matcher.source] || 0) + 1;
    report.categories[matcher.category] = (report.categories[matcher.category] || 0) + 1;
  };

  const redactText = (text: string) => {
    let next = text;
    for (const matcher of matchers) {
      for (const value of matcher.values) {
        if (!value || !next.includes(value)) continue;
        next = next.split(value).join(REDACTION);
        record(matcher);
      }
      for (const pattern of matcher.patterns) {
        next = next.replace(pattern, () => {
          record(matcher);
          return REDACTION;
        });
      }
    }
    return next;
  };

  const redactValue = <T>(value: T): T => redactUnknown(value, redactText) as T;

  return {
    redactText,
    redactValue,
    report: () => ({
      redactions: report.redactions,
      sources: { ...report.sources },
      categories: { ...report.categories },
    }),
    matcherCount: () => matchers.length,
  };
}

export function secretMatchersFromEnv(env: NodeJS.ProcessEnv = process.env): SecretMatcher[] {
  const matchers: SecretMatcher[] = [];
  for (const [name, rawValue] of Object.entries(env)) {
    if (!rawValue || rawValue.length < MIN_SECRET_LENGTH || !SECRET_NAME_PATTERN.test(name) || EXCLUDED_ENV_PATTERN.test(name)) continue;
    const values = encodedForms(rawValue).filter((value) => value.length >= MIN_SECRET_LENGTH);
    if (!values.length) continue;
    matchers.push({ source: "env", category: envCategory(name), values, patterns: [] });
  }
  return matchers;
}

export function secretMatchersFromConfig(configPath = CONFIG_PATH): SecretMatcher[] {
  if (!fs.existsSync(configPath)) return [];
  let parsed: ExplicitConfig;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as ExplicitConfig;
  } catch {
    return [];
  }

  const values = (Array.isArray(parsed.values) ? parsed.values : [])
    .filter((value): value is string => typeof value === "string" && value.length >= MIN_SECRET_LENGTH)
    .flatMap(encodedForms)
    .filter((value) => value.length >= MIN_SECRET_LENGTH);
  const patterns = (Array.isArray(parsed.patterns) ? parsed.patterns : [])
    .filter((value): value is string => typeof value === "string")
    .map((value) => safeRegex(value))
    .filter((value): value is RegExp => Boolean(value));

  return values.length || patterns.length ? [{ source: "config", category: "explicit", values, patterns }] : [];
}

function redactUnknown(value: unknown, redactText: (text: string) => string): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, redactText));
  if (!isPlainObject(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) output[key] = redactUnknown(child, redactText);
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encodedForms(value: string) {
  const forms = new Set([value]);
  try {
    forms.add(Buffer.from(value, "utf8").toString("base64"));
  } catch {
    // ignore encoding failures without exposing values
  }
  try {
    forms.add(encodeURIComponent(value));
  } catch {
    // ignore encoding failures without exposing values
  }
  return [...forms];
}

function envCategory(name: string) {
  if (/token/i.test(name)) return "token";
  if (/key/i.test(name)) return "key";
  if (/password|passwd|pwd/i.test(name)) return "password";
  if (/cookie/i.test(name)) return "cookie";
  if (/credential/i.test(name)) return "credential";
  return "secret";
}

function safeRegex(value: string) {
  try {
    return new RegExp(value, "g");
  } catch {
    return undefined;
  }
}
