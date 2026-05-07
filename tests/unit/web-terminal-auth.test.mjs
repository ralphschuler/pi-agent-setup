import assert from "node:assert/strict";
import test from "node:test";

import { cookieValue, hasTrustedCsrfOrigin, isAuthed, isTrustedOrigin, requiresCsrfCheck } from "../../extensions/web-terminal/auth.ts";

function req(headers = {}, method = "GET") {
  return { headers, method };
}

test("web terminal auth accepts query token or matching cookie", () => {
  assert.equal(isAuthed(req(), new URL("http://localhost/?token=abc"), "abc"), true);
  assert.equal(isAuthed(req({ cookie: "pi_web_terminal_token=abc" }), new URL("http://localhost/"), "abc"), true);
  assert.equal(isAuthed(req({ cookie: "pi_web_terminal_token=wrong" }), new URL("http://localhost/"), "abc"), false);
  assert.equal(cookieValue("a=1; pi_web_terminal_token=hello%20world", "pi_web_terminal_token"), "hello world");
  assert.equal(cookieValue("a=1", "pi_web_terminal_token"), undefined);
});

test("web terminal origin checks require same host", () => {
  assert.equal(isTrustedOrigin(req({ host: "localhost:17474", origin: "http://localhost:17474" })), true);
  assert.equal(isTrustedOrigin(req({ host: "localhost:17474", origin: "http://evil.example" })), false);
  assert.equal(isTrustedOrigin(req({ host: "localhost:17474" })), true);
  assert.equal(isTrustedOrigin(req({ host: "localhost:17474", origin: ["http://localhost:17474"] })), false);
  assert.equal(isTrustedOrigin(req({ host: "localhost:17474", origin: "http://[bad" })), false);
});

test("web terminal csrf checks only unsafe cookie-authenticated requests", () => {
  assert.equal(requiresCsrfCheck(req({ cookie: "pi_web_terminal_token=abc" }, "POST"), new URL("http://localhost/api/chat/prompt")), true);
  assert.equal(requiresCsrfCheck(req({ cookie: "pi_web_terminal_token=abc" }, "GET"), new URL("http://localhost/api/status")), false);
  assert.equal(requiresCsrfCheck(req({}, "POST"), new URL("http://localhost/api/chat/prompt?token=abc")), false);
});

test("web terminal csrf origin checks fail closed without same-origin evidence", () => {
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474" }, "POST")), false);
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474", origin: "http://localhost:17474" }, "POST")), true);
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474", origin: "http://evil.example" }, "POST")), false);
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474", referer: "http://localhost:17474/terminal" }, "POST")), true);
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474", referer: "http://evil.example/terminal" }, "POST")), false);
  assert.equal(hasTrustedCsrfOrigin(req({ host: "localhost:17474", origin: ["http://localhost:17474"] }, "POST")), false);
});
