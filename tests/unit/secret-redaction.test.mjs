import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import secretRedaction, { createSecretRedactor, secretMatchersFromEnv } from "../../extensions/secret-redaction/index.ts";
import { readText, tempDir } from "../helpers.mjs";

test("secret redaction builds env inventory without short or unrelated values", () => {
  const matchers = secretMatchersFromEnv({
    API_TOKEN: "alpha-secret-token-123",
    npm_config__authToken: "npm-secret-token-123",
    NORMAL_VALUE: "alpha-secret-token-123",
    SHORT_SECRET: "short",
    PATH: "alpha-secret-token-123",
  });

  assert.equal(matchers.length, 2);
  assert.deepEqual(
    matchers.map((matcher) => matcher.category),
    ["token", "token"],
  );
});

test("secret redaction redacts exact and encoded forms recursively", () => {
  const secret = "alpha-secret-token-123";
  const redactor = createSecretRedactor({ API_TOKEN: secret }, path.join(tempDir("no-config"), "missing.json"));
  const payload = {
    messages: [{ content: `exact ${secret}` }],
    encoded: Buffer.from(secret, "utf8").toString("base64"),
    safe: "keep me",
  };

  const redacted = redactor.redactValue(payload);
  assert.equal(redacted.messages[0].content, "exact [REDACTED]");
  assert.equal(redacted.encoded, "[REDACTED]");
  assert.equal(redacted.safe, "keep me");
  assert.equal(redactor.report().sources.env, 2);
});

test("secret redaction reads optional explicit local config without leaking values", () => {
  const dir = tempDir("secret-redaction-config");
  const configPath = path.join(dir, "secret-redaction.json");
  fs.writeFileSync(configPath, JSON.stringify({ values: ["configured-secret-123"], patterns: ["gho_[A-Za-z0-9_]+"] }), "utf8");

  const redactor = createSecretRedactor({}, configPath);
  const text = redactor.redactText("configured-secret-123 and gho_placeholdertoken");

  assert.equal(text, "[REDACTED] and [REDACTED]");
  assert.deepEqual(Object.keys(redactor.report().categories), ["explicit"]);
});

test("secret redaction extension registers context and provider request hooks", async () => {
  const handlers = new Map();
  const pi = { on: (name, handler) => handlers.set(name, handler) };
  const previous = process.env.API_TOKEN;
  process.env.API_TOKEN = "runtime-secret-token-123";

  try {
    secretRedaction(pi);

    assert.equal(typeof handlers.get("context"), "function");
    assert.equal(typeof handlers.get("before_provider_request"), "function");

    const contextResult = await handlers.get("context")({ messages: [{ role: "user", content: "runtime-secret-token-123" }] });
    const providerResult = await handlers.get("before_provider_request")({ payload: { input: "runtime-secret-token-123" } });
    assert.equal(contextResult.messages[0].content, "[REDACTED]");
    assert.equal(providerResult.input, "[REDACTED]");
  } finally {
    if (previous === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = previous;
  }
});

test("secret redaction resource is documented and scoped", () => {
  const extension = readText("extensions/secret-redaction/index.ts");
  const docs = readText("docs/extensions/secret-redaction.md");
  const readme = readText("README.md");
  const mkdocs = readText("mkdocs.yml");

  assert.ok(extension.includes('pi.on("context"'));
  assert.ok(extension.includes('pi.on("before_provider_request"'));
  assert.ok(docs.includes("does not scan `.env` files"));
  assert.ok(docs.includes("Raw secret values are never reported"));
  assert.ok(readme.includes("extensions/secret-redaction/"));
  assert.ok(mkdocs.includes("extensions/secret-redaction.md"));
});
