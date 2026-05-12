import assert from "node:assert/strict";
import test from "node:test";

import processesExtension from "../../extensions/processes/index.ts";

function registeredProcessTool() {
  let tool;
  processesExtension({
    registerTool(candidate) {
      tool = candidate;
    },
    registerCommand() {},
    on() {},
  });
  assert.ok(tool, "process tool registered");
  return tool;
}

function ctx() {
  return { cwd: process.cwd(), hasUI: false, ui: { setStatus() {}, notify() {} } };
}

test("process start does not emit tool updates after execute returns", async () => {
  const tool = registeredProcessTool();
  const updates = [];
  const script = "setTimeout(() => console.log('late-output'), 20); setTimeout(() => {}, 120);";
  const command = `"${process.execPath.replace(/"/g, '\\"')}" -e ${JSON.stringify(script)}`;

  const result = await tool.execute(
    "process-start-late-output",
    { action: "start", name: "late-output-repro", command },
    new AbortController().signal,
    (update) => updates.push(update),
    ctx(),
  );

  assert.match(result.content[0].text, /Started process #\d+ \(late-output-repro\)\./);
  assert.equal(updates.length, 1, "initial in-run update is allowed");

  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(updates.length, 1, "background process output/exit must not call stale onUpdate");

  await tool.execute("process-clear", { action: "clear" }, new AbortController().signal, undefined, ctx());
});
