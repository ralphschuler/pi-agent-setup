import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertSafeTextContent,
  dangerousShellReason,
  exposesNetwork,
  isBinaryBuffer,
  isPackageInstallCommand,
  isProtectedSecretPath,
  isProtectedSystemPath,
  normalizeRelativePath,
  resolveExistingInsideRoot,
  resolveInsideRoot,
} from "../../extensions/shared/safety.ts";

test("shared safety normalizes and classifies protected paths", () => {
  assert.equal(normalizeRelativePath("@./foo\\bar"), "foo/bar");
  assert.equal(isProtectedSecretPath(".env"), true);
  assert.equal(isProtectedSecretPath("config/private-key.pem"), true);
  assert.equal(isProtectedSecretPath("src/index.ts"), false);
  assert.equal(isProtectedSystemPath("/etc/hosts"), true);
  assert.equal(isProtectedSystemPath("$HOME/.ssh/id_ed25519"), true);
  assert.equal(isProtectedSystemPath("./etc/hosts"), false);
});

test("shared safety resolves paths inside root and rejects escapes", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-shared-safety-")));
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "pi-shared-safety-outside-")));
  writeFileSync(join(root, "ok.txt"), "ok");
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(join(outside, "secret.txt"), join(root, "link.txt"));

  assert.equal(resolveInsideRoot(root, "ok.txt"), join(root, "ok.txt"));
  assert.equal(resolveInsideRoot(root, "../outside.txt"), null);
  assert.equal(resolveExistingInsideRoot(root, "ok.txt"), join(root, "ok.txt"));
  assert.equal(resolveExistingInsideRoot(root, "link.txt"), null);
});

test("shared safety rejects binary and oversized text content", () => {
  assert.equal(isBinaryBuffer(Buffer.from([0, 1, 2])), true);
  assert.equal(isBinaryBuffer(Buffer.from("plain text\n")), false);
  assert.throws(() => assertSafeTextContent("x".repeat(20), "large.txt", 10), /Large content denied/);
  assert.throws(() => assertSafeTextContent("a\u0000b", "binary.txt"), /Binary content denied/);
});

test("shared safety classifies shell/package/network risk", () => {
  assert.equal(dangerousShellReason("rm -rf /"), "destructive rm target");
  assert.equal(dangerousShellReason("rm -rf ./dist"), undefined);
  assert.equal(isPackageInstallCommand("npm install left-pad"), true);
  assert.equal(isPackageInstallCommand("npm test"), false);
  assert.equal(exposesNetwork("vite --host 0.0.0.0"), true);
  assert.equal(exposesNetwork("vite --host=0.0.0.0"), true);
  assert.equal(exposesNetwork("vite --host [::]:5173"), true);
  assert.equal(exposesNetwork("server --listen 127.0.0.1"), false);
});
