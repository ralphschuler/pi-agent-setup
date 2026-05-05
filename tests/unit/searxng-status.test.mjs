import assert from "node:assert/strict";
import test from "node:test";

import { checkSearxngHealth, formatSearxngStatus, DEFAULT_SEARXNG_URL } from "../../extensions/searxng/index.ts";
import { readText } from "../helpers.mjs";

test("searxng status reports default backend when env is missing", async () => {
  const health = await checkSearxngHealth("", undefined, async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));

  assert.equal(health.baseUrl, DEFAULT_SEARXNG_URL);
  assert.equal(health.source, "default");
  assert.equal(health.ok, true);
  assert.deepEqual(health.remediation, []);
});

test("searxng status reports env backend and non-ok remediation", async () => {
  const health = await checkSearxngHealth(
    "https://search.example/",
    undefined,
    async () => new Response("bad", { status: 503, statusText: "Unavailable" }),
  );

  assert.equal(health.baseUrl, "https://search.example");
  assert.equal(health.source, "SEARXNG_URL");
  assert.equal(health.ok, false);
  assert.equal(health.status, 503);
  assert.match(health.error, /503 Unavailable/);
  assert.ok(health.remediation.some((step) => step.includes("docker run")));
  assert.ok(health.remediation.some((step) => step.includes("SEARXNG_URL=https://search.example")));
});

test("searxng status reports unreachable backend remediation", async () => {
  const health = await checkSearxngHealth(undefined, undefined, async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8080");
  });

  assert.equal(health.ok, false);
  assert.match(health.error, /ECONNREFUSED/);
  assert.ok(health.remediation.some((step) => step.includes("docker run")));
  assert.ok(health.remediation.some((step) => step.includes("export SEARXNG_URL")));
});

test("searxng status output includes active URL, source, and remediation", () => {
  const text = formatSearxngStatus({
    baseUrl: "http://localhost:8080",
    source: "default",
    ok: false,
    error: "connect failed",
    remediation: ["docker run --rm -p 8080:8080 searxng/searxng", "export SEARXNG_URL=https://your-searxng.example"],
  });

  assert.ok(text.includes("Backend URL: http://localhost:8080"));
  assert.ok(text.includes("Source: default"));
  assert.ok(text.includes("Status: unreachable"));
  assert.ok(text.includes("docker run"));
});

test("searxng command, tool, and docs are present", () => {
  const source = readText("extensions/searxng/index.ts");
  const docs = readText("docs/extensions/searxng.md");
  const docsIndex = readText("docs/extensions/index.md");
  const readme = readText("README.md");

  assert.ok(source.includes('pi.registerCommand("searxng"'));
  assert.ok(source.includes('name: "searxng_status"'));
  assert.ok(docs.includes("/searxng"));
  assert.ok(docs.includes("docker run --rm -p 8080:8080 searxng/searxng"));
  assert.ok(docsIndex.includes("searxng_status"));
  assert.ok(readme.includes("/searxng"));
});
