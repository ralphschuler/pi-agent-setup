import assert from "node:assert/strict";
import test from "node:test";

import safetyGuard, { dangerousReason } from "../../extensions/safety-guard/index.ts";

test("safety guard detects destructive rm variants", () => {
  for (const command of ["rm -rf /", "rm -fr /", "rm -rf -- /", "rm -rf /*", "rm -Rf /dev/sda", "/bin/rm -rf /"]) {
    assert.ok(dangerousReason(command), command);
  }
  for (const command of ["rm -rf ./dist", "rm -f file.txt"]) {
    assert.equal(dangerousReason(command), undefined, command);
  }
});

test("safety guard blocks process start without UI", async () => {
  let handler;
  safetyGuard({ on: (_name, cb) => (handler = cb) });
  const result = await handler({ toolName: "process", input: { action: "start", command: "rm -fr /" } }, { hasUI: false });

  assert.equal(result.block, true);
  assert.match(result.reason, /Blocked dangerous shell command/);
});
