import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("welcome-screen registers startup card and command", () => {
  const source = readText("extensions/welcome-screen/index.ts");

  assert.match(source, /WELCOME_TYPE = "pi-welcome-screen"/);
  assert.match(source, /pi\.registerMessageRenderer\(WELCOME_TYPE/);
  assert.match(source, /pi\.on\("session_start"/);
  assert.match(source, /event\.reason === "startup" \|\| event\.reason === "reload"/);
  assert.match(source, /pi\.registerCommand\("welcome"/);
  assert.match(source, /showWelcome\(pi, ctx\)/);
});

test("welcome-screen includes neofetch-style system facts", () => {
  const source = readText("extensions/welcome-screen/index.ts");

  for (const label of ["model", "cwd", "git", "node", "host", "os", "theme"]) {
    assert.ok(source.includes(`["${label}"`), `missing ${label} fact`);
  }
  assert.match(source, /const LOGO = \[/);
  assert.match(source, /gitBranch\(cwd\)/);
  assert.match(source, /configuredTheme\(\) \|\| "auto"/);
  assert.match(source, /settings\.json/);
  assert.doesNotMatch(source, /\["theme", "synthwave"\]/);
  assert.match(source, /truncateToWidth/);
});
