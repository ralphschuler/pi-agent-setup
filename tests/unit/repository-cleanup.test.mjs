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

test("critical process, browser bridge, and welcome extensions are typechecked", () => {
  assert.doesNotMatch(readText("extensions/processes/index.ts"), /@ts-nocheck/);
  assert.doesNotMatch(readText("extensions/welcome-screen/index.ts"), /@ts-nocheck/);
});

test("browser bridge is typechecked", () => {
  const source = readText("extensions/browser-bridge/index.ts");

  assert.doesNotMatch(source, /@ts-nocheck/);
});

test("browser bridge HTTP setup does not expose token", () => {
  const source = readText("extensions/browser-bridge/index.ts");

  assert.match(source, /Token: hidden on HTTP setup page/);
  assert.match(source, /bridge\?token=<token-from-pi-tui>/);
  assert.match(source, /details: \{ active: true, connected: Boolean\(client\), port, host: DEFAULT_HOST, urls, token: TOKEN/);
});

test("web terminal enforces origin and csrf checks", () => {
  const web = readText("extensions/web-terminal/index.ts");
  const auth = readText("extensions/web-terminal/auth.ts");

  assert.match(web, /requiresCsrfCheck\(req, url\) && !isTrustedOrigin\(req\)/);
  assert.match(web, /HTTP\/1\.1 403 Forbidden/);
  assert.match(web, /safeHandleApi/);
  assert.match(auth, /originUrl\.host === host/);
  assert.match(auth, /pi_web_terminal_token/);
});

test("web and browser servers default to localhost with opt-in LAN binding", () => {
  const web = readText("extensions/web-terminal/index.ts");
  const browser = readText("extensions/browser-bridge/index.ts");

  assert.match(web, /PI_WEB_TERMINAL_HOST \|\| "127\.0\.0\.1"/);
  assert.match(browser, /PI_BROWSER_BRIDGE_HOST \|\| "127\.0\.0\.1"/);
  assert.match(readText("extensions/web-terminal/auth.ts"), /function isAuthed\(req: http\.IncomingMessage, url: URL, token: string\)/);
  assert.match(readText("extensions/web-terminal/auth.ts"), /cookieValue\(req\.headers\.cookie, "pi_web_terminal_token"\) === token/);
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

test("web terminal avoids unauthenticated CDN runtime and excludes API service-worker fallback", () => {
  const html = readText("extensions/web-terminal/public/index.html");
  const sw = readText("extensions/web-terminal/public/sw.js");

  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
  assert.match(html, /\/vendor\/xterm\/xterm\.js/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});

test("web terminal basic accessibility and chat failure handling", () => {
  const html = readText("extensions/web-terminal/public/index.html");
  const app = readText("extensions/web-terminal/public/app.js");

  assert.doesNotMatch(html, /user-scalable=no/);
  assert.match(html, /aria-label="Message pi or type slash command"/);
  assert.match(html, /aria-label="Log level filter"/);
  assert.match(html, /aria-label="Search tools"/);
  assert.match(html, /aria-label="Terminal"/);
  assert.match(app, /Failed to send prompt/);
  assert.match(app, /input\.value = prompt/);
});

test("browser bridge documents broad host permissions", () => {
  const docs = readText("docs/extensions/browser-bridge.md");
  const popup = readText("extensions/browser-bridge/browser-extension/popup.html");

  assert.match(docs, /<all_urls>/);
  assert.match(popup, /&lt;all_urls&gt;/);
  assert.match(popup, /id="token" type="password"/);
});

test("process tool implements advertised alerts and log watches", () => {
  const source = readText("extensions/processes/index.ts");

  for (const phrase of ["alertOnSuccess", "alertOnFailure", "alertOnKill", "logWatches", "notifyProcessExit", "checkLogWatches"]) {
    assert.match(source, new RegExp(phrase), `missing ${phrase}`);
  }
  assert.match(source, /Invalid log watch regex/);
  assert.match(source, /Unsafe log watch regex/);
  assert.match(source, /regex = new RegExp\(input\.pattern\)/);
  assert.match(source, /watch\.regex\.test\(text\)/);
  assert.doesNotMatch(source, /new RegExp\(watch\.pattern\)/);
  assert.match(source, /LOG_FILE_LIMIT/);
  assert.match(source, /appendBoundedLog/);
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
