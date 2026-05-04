import assert from "node:assert/strict";
import test from "node:test";

import { readText, run } from "../helpers.mjs";

test("GitHub Actions runs validation, test suite, and Docker smoke test", () => {
  const workflow = readText(".github/workflows/check.yml");

  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci --legacy-peer-deps/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run test:ci/);
  assert.match(workflow, /bash scripts\/test-docker\.sh/);
});

test("Dockerfile performs package validation and full CI tests", () => {
  const dockerfile = readText("Dockerfile");

  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /npm install -g @mariozechner\/pi-coding-agent/);
  assert.match(dockerfile, /npm run check/);
  assert.match(dockerfile, /npm run test:ci/);
  assert.match(dockerfile, /npm run install:pi/);
});

test("Docker smoke-test script verifies installed pi package", () => {
  const script = readText("scripts/test-docker.sh");

  assert.match(script, /docker build -t "\$IMAGE" \./);
  assert.match(script, /command -v pi/);
  assert.match(script, /npm --prefix \/opt\/pi-agent-setup run test:ci/);
  assert.match(script, /settings\.json/);
  assert.match(script, /Docker image test passed/);
});

test("e2e local smoke command completes", () => {
  const result = run("npm", ["run", "check"]);
  assert.match(result.stdout, /Repository checks passed\./);
});
