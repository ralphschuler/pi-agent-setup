import assert from "node:assert/strict";
import test from "node:test";

import safetyGuard, {
  dangerousReason,
  evaluatePolicy,
  exposesNetwork,
  isPackageInstallCommand,
  touchesProtectedPath,
} from "../../extensions/safety-guard/index.ts";
import { isSafeLogWatchPattern } from "../../extensions/processes/index.ts";

test("safety guard detects destructive rm variants", () => {
  for (const command of ["rm -rf /", "rm -fr /", "rm -rf -- /", "rm -rf /*", "rm -Rf /dev/sda", "/bin/rm -rf /"]) {
    assert.ok(dangerousReason(command), command);
  }
  for (const command of ["rm -rf ./dist", "rm -f file.txt"]) {
    assert.equal(dangerousReason(command), undefined, command);
  }
});

test("process log watch rejects unsafe regex patterns", () => {
  assert.equal(isSafeLogWatchPattern("ERROR|WARN"), true);
  assert.equal(isSafeLogWatchPattern("(a+)+$"), false);
  assert.equal(isSafeLogWatchPattern("a".repeat(201)), false);
});

test("policy guard classifies package installs, network exposure, and protected paths", () => {
  assert.equal(isPackageInstallCommand("npm install left-pad"), true);
  assert.equal(isPackageInstallCommand("pip install requests"), true);
  assert.equal(isPackageInstallCommand("npm test"), false);
  assert.equal(exposesNetwork("vite --host 0.0.0.0"), true);
  assert.equal(exposesNetwork("vite --host 127.0.0.1"), false);
  assert.equal(touchesProtectedPath({ toolName: "write", input: { path: "/etc/hosts" } }), true);
});

test("policy guard evaluates decisions by category", () => {
  assert.deepEqual(evaluatePolicy({ toolName: "bash", input: { command: "npm install left-pad" } }), {
    action: "confirm",
    reason: "package install command requires approval",
    category: "package-install",
  });
  assert.deepEqual(evaluatePolicy({ toolName: "write", input: { path: "/etc/hosts" } }), {
    action: "block",
    reason: "protected path is blocked",
    category: "protected-path",
  });
  assert.equal(evaluatePolicy({ toolName: "bash", input: { command: "npm test" } }).action, "allow");
});

test("safety guard blocks process start without UI", async () => {
  let handler;
  safetyGuard({ on: (_name, cb) => (handler = cb) });
  const result = await handler({ toolName: "process", input: { action: "start", command: "rm -fr /" } }, { hasUI: false });

  assert.equal(result.block, true);
  assert.match(result.reason, /Blocked dangerous shell command/);
});
