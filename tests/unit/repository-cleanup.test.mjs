import assert from "node:assert/strict";
import test from "node:test";

import { readJson, readText } from "../helpers.mjs";

test("todo start action maps to in_progress status and icon", () => {
  const source = readText("extensions/todo/index.ts");

  assert.match(source, /params\.action === "start" \? "in_progress" : "pending"/);
  assert.match(source, /in_progress: "◐"/);
  assert.doesNotMatch(source, /status as TodoStatus/);
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

test("process tool implements advertised alerts and log watches", () => {
  const source = readText("extensions/processes/index.ts");

  for (const phrase of ["alertOnSuccess", "alertOnFailure", "alertOnKill", "logWatches", "notifyProcessExit", "checkLogWatches"]) {
    assert.match(source, new RegExp(phrase), `missing ${phrase}`);
  }
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
