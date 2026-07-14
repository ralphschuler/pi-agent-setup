import assert from "node:assert/strict";
import test from "node:test";

import { readText, run } from "../helpers.mjs";

test("GitHub Actions runs validation, test suite, and Docker smoke test", () => {
  const workflow = readText(".github/workflows/check.yml");

  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci --legacy-peer-deps/);
  assert.match(workflow, /npm run test:ci/);
  assert.doesNotMatch(workflow, /run: npm run check/);
  assert.match(readText("scripts/check.sh"), /npm run format:check/);
  assert.match(workflow, /bash scripts\/test-docker\.sh/);
});

test("Dockerfile performs package validation and full CI tests", () => {
  const dockerfile = readText("Dockerfile");

  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /npm install -g @mariozechner\/pi-coding-agent@0\.73\.0/);
  assert.match(dockerfile, /npm run test:ci/);
  assert.doesNotMatch(dockerfile, /RUN npm run check/);
  assert.match(dockerfile, /PI_SETUP_SKIP_DEPS=1 PI_SETUP_SKIP_CHECK=1 npm run install:pi/);
});

test("Docker smoke-test script verifies installed pi package", () => {
  const script = readText("scripts/test-docker.sh");

  assert.match(script, /docker build -t "\$IMAGE" \./);
  assert.match(script, /command -v pi/);
  assert.match(script, /pi --help/);
  assert.doesNotMatch(script, /run test:ci/);
  assert.match(script, /settings\.json/);
  assert.match(script, /Docker image test passed/);
});

test("e2e local smoke command completes", () => {
  const result = run("npm", ["run", "check"]);
  assert.match(result.stdout, /Repository checks passed\./);
});
