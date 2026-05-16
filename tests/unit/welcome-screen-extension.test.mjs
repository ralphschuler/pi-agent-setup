import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("welcome-screen registers startup compact card and command modes", () => {
  const source = readText("extensions/welcome-screen/index.ts");

  assert.match(source, /WELCOME_TYPE = "pi-welcome-screen"/);
  assert.match(source, /type WelcomeMode = "compact" \| "full"/);
  assert.match(source, /pi\.registerMessageRenderer\(WELCOME_TYPE/);
  assert.match(source, /pi\.on\("session_start"/);
  assert.match(source, /event\.reason === "startup" \|\| event\.reason === "reload"/);
  assert.match(source, /showWelcome\(pi, ctx, "compact"\)/);
  assert.match(source, /pi\.registerCommand\("welcome"/);
  assert.match(source, /parseWelcomeMode\(args\)/);
  assert.match(source, /Usage: \/welcome \[compact\|full\]/);
});

test("welcome-screen includes cockpit facts with compact and full modes", () => {
  const source = readText("extensions/welcome-screen/index.ts");

  for (const label of ["model", "cwd", "git", "context", "tools", "think", "host", "theme"]) {
    assert.ok(source.includes(`["${label}"`), `missing compact ${label} fact`);
  }
  for (const label of ["version", "session", "entries", "node", "os"]) {
    assert.ok(source.includes(`["${label}"`), `missing full ${label} fact`);
  }

  assert.match(source, /VERSION \|\| "unknown"/);
  assert.match(source, /gitSummary\(cwd\)/);
  assert.match(source, /gitDirty\(cwd\)/);
  assert.match(source, /gitUpstream\(cwd\)/);
  assert.match(source, /ctx\?\.getContextUsage\?\.\(\)/);
  assert.match(source, /pi\.getActiveTools/);
  assert.match(source, /pi\.getThinkingLevel/);
  assert.match(source, /configuredTheme\(\) \|\| "auto"/);
  assert.match(source, /settings\.json/);
  assert.doesNotMatch(source, /\["theme", "synthwave"\]/);
});

test("welcome-screen renderer is width-safe and responsive", () => {
  const source = readText("extensions/welcome-screen/index.ts");

  assert.match(source, /const LOGO = \[/);
  assert.match(source, /const safeWidth = Math\.max\(1, width \|\| 1\)/);
  assert.match(source, /LOGO\.reduce\(\(max, line\) => Math\.max\(max, visibleWidth\(line\)\), 0\)/);
  assert.match(source, /truncateToWidth\(right, safeWidth\)/);
  assert.match(source, /truncateToWidth\(`\$\{logo\}\$\{pad\}\$\{right\}`, safeWidth\)/);
});
