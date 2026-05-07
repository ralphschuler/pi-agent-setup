import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { execJson, safeResolve } from "../../extensions/web-terminal/routes.ts";
import { readText } from "../helpers.mjs";

test("web terminal route helpers keep file access inside cwd", () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "pi-web-terminal-")));
  writeFileSync(join(cwd, "ok.txt"), "ok");

  assert.equal(safeResolve(cwd, "ok.txt"), join(cwd, "ok.txt"));
  assert.equal(safeResolve(cwd, "../outside.txt"), null);
});

test("web terminal execJson parses command JSON and falls back", async () => {
  assert.deepEqual(await execJson({ exec: async () => ({ code: 0, stdout: '{"items":[1]}' }) }, "cmd", [], "items"), { items: [1] });
  assert.deepEqual(await execJson({ exec: async () => ({ code: 1, stdout: "" }) }, "cmd", [], "items"), { items: [] });
});

test("web terminal API routes are split into route family modules", () => {
  const entry = readText("extensions/web-terminal/routes.ts");
  for (const file of ["system-routes", "chat-routes", "file-routes", "log-routes", "resource-routes", "cli-routes"]) {
    assert.match(entry, new RegExp(`\\./${file}\\.ts`));
  }
  assert.match(entry, /handleApi/);
  assert.match(entry, /handleSystemRoute/);
  assert.match(entry, /handleCliRoute/);
});
