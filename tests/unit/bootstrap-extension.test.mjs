import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("bootstrap command creates pi-ready context and ADR starter files", () => {
  const source = readText("extensions/bootstrap/index.ts");

  assert.match(source, /pi\.registerCommand\("bootstrap"/);
  assert.match(source, /CONTEXT\.md/);
  assert.match(source, /docs\/adr\/README\.md/);
  assert.match(source, /docs\/adr\/0001-record-architecture-decisions\.md/);
  assert.match(source, /Agent guidance/);
  assert.match(source, /Architecture decision records/);
  assert.match(source, /Status: Accepted/);
  assert.match(source, /git.+rev-parse.+--show-toplevel/s);
  assert.match(source, /--dry-run/);
  assert.match(source, /--force/);
  assert.match(source, /ctx\.ui\.notify/);
});
