import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../helpers.mjs";

test("run helper returns failures when check is disabled", () => {
  const result = run("node", ["--eval", "process.exit(7)"], { check: false });
  assert.equal(result.status, 7);
});

test("run helper throws detailed assertion errors by default", () => {
  assert.throws(() => run("node", ["--eval", "console.log('out'); console.error('err'); process.exit(3)"]), /Command failed: node --eval/);
});
