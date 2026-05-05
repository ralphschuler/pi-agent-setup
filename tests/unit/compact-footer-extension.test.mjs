import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("compact-footer installs a custom footer on session start", () => {
  const source = readText("extensions/compact-footer/index.ts");

  assert.match(source, /pi\.on\("session_start"/);
  assert.match(source, /ctx\.ui\.setFooter/);
  assert.match(source, /footerData\.getGitBranch\(\)/);
  assert.match(source, /footerData\.getExtensionStatuses\(\)/);
  assert.match(source, /usageSummary\(ctx\)/);
});

test("compact-footer compresses noisy status labels", () => {
  const source = readText("extensions/compact-footer/index.ts");

  for (const phrase of ["bb off", "web off", "pretty", "proc ", "mem ", "🪨 "]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing compact label ${phrase}`);
  }
  assert.match(source, /STATUS_LIMIT = 5/);
  assert.match(source, /truncateToWidth/);
});
