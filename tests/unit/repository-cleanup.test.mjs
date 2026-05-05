import assert from "node:assert/strict";
import test from "node:test";

import { readJson, readText } from "../helpers.mjs";

test("todo start action maps to in_progress status and icon", () => {
  const source = readText("extensions/todo/index.ts");

  assert.match(source, /params\.action === "start" \? "in_progress" : "pending"/);
  assert.match(source, /in_progress: "◐"/);
  assert.match(source, /const DISPLAY_LIMIT = 5/);
  assert.match(source, /completed items stay visible until space is needed/);
  assert.match(source, /visible\.slice\(0, DISPLAY_LIMIT\)/);
  assert.doesNotMatch(source, /visible\.slice\(-DISPLAY_LIMIT\)/);
  assert.match(source, /function progressSummary\(\)/);
  assert.match(source, /done, \$\{open\} open/);
  assert.match(source, /sessionStorePath\(ctx\?\.sessionManager\?\.getSessionFile\?\.\(\)\)/);
  assert.match(source, /\.pi", "agent", "todos"/);
  assert.doesNotMatch(source, /status as TodoStatus/);
});

test("safety guard covers bash and process shell execution", () => {
  const source = readText("extensions/safety-guard/index.ts");

  assert.match(source, /isToolCallEventType\("bash", event as any\)/);
  assert.match(source, /toolName === "process"/);
  assert.match(source, /input\?\.action === "start"/);
  assert.match(source, /Blocked dangerous shell command/);
});

test("browser bridge HTTP setup does not expose token", () => {
  const source = readText("extensions/browser-bridge/index.ts");

  assert.match(source, /Token: hidden on HTTP setup page/);
  assert.match(source, /bridge\?token=<token-from-pi-tui>/);
  assert.match(source, /details: \{ active: true, connected: Boolean\(client\), port, host: DEFAULT_HOST, urls, token: TOKEN/);
});

test("web and browser servers default to localhost with opt-in LAN binding", () => {
  const web = readText("extensions/web-terminal/index.ts");
  const browser = readText("extensions/browser-bridge/index.ts");

  assert.match(web, /PI_WEB_TERMINAL_HOST \|\| "127\.0\.0\.1"/);
  assert.match(browser, /PI_BROWSER_BRIDGE_HOST \|\| "127\.0\.0\.1"/);
  assert.match(web, /function isAuthed\(req: http\.IncomingMessage, url: URL, token: string\)/);
  assert.match(web, /cookieValue\(req\.headers\.cookie, "pi_web_terminal_token"\) === token/);
  assert.doesNotMatch(web, /cookie\?\.includes\(`pi_web_terminal_token=/);
});

test("web and browser servers stay inactive until activated", () => {
  const web = readText("extensions/web-terminal/index.ts");
  const browser = readText("extensions/browser-bridge/index.ts");

  assert.match(web, /if \(!server\) return "web terminal: inactive"/);
  assert.match(browser, /if \(!server\) return "browser bridge: inactive"/);
  assert.doesNotMatch(web, /pi\.on\("session_start", async \(_event, ctx\) => \{\s*currentCwd = ctx\.cwd;\s*try \{\s*await startServer/s);
  assert.doesNotMatch(browser, /pi\.on\("session_start", async \(_event, ctx\) => \{\s*try \{\s*await startServer/s);
});

test("synthwave theme is packaged", () => {
  const theme = readJson("themes/synthwave.json");

  assert.equal(theme.name, "synthwave");
  assert.equal(theme.colors.accent, "pink");
  assert.equal(theme.colors.borderAccent, "cyan");
  assert.equal(theme.colors.bashMode, "green");
});

test("process tool implements advertised alerts and log watches", () => {
  const source = readText("extensions/processes/index.ts");

  for (const phrase of ["alertOnSuccess", "alertOnFailure", "alertOnKill", "logWatches", "notifyProcessExit", "checkLogWatches"]) {
    assert.match(source, new RegExp(phrase), `missing ${phrase}`);
  }
  assert.match(source, /Invalid log watch regex/);
  assert.match(source, /regex = new RegExp\(input\.pattern\)/);
  assert.match(source, /watch\.regex\.test\(text\)/);
  assert.doesNotMatch(source, /new RegExp\(watch\.pattern\)/);
});

test("repository has type and lint hygiene scripts", () => {
  const pkg = readJson("package.json");

  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.lint, "eslint .");
  assert.match(readText("scripts/check.sh"), /npm run typecheck/);
  assert.match(readText("scripts/check.sh"), /npm run lint/);
  assert.ok(pkg.devDependencies.typescript);
  assert.ok(pkg.devDependencies.eslint);
});
