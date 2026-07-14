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

test("process output redacts secrets before returning agent-visible details", async () => {
  const tool = registeredProcessTool();
  const originalToken = process.env.API_TOKEN;
  process.env.API_TOKEN = "process-secret-token-123";
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify("console.log(process.env.API_TOKEN)")}`;

  try {
    const start = await tool.execute(
      "process-secret-start",
      { action: "start", name: "secret-output", command },
      new AbortController().signal,
      undefined,
      ctx(),
    );
    const id = start.content[0].text.match(/Started process #(\d+)/)?.[1];
    await new Promise((resolve) => setTimeout(resolve, 250));
    const output = await tool.execute("process-secret-output", { action: "output", id }, new AbortController().signal, undefined, ctx());
    assert.doesNotMatch(JSON.stringify(output), /process-secret-token-123/);
    assert.match(output.content[0].text, /REDACTED/);
    await tool.execute("process-secret-clear", { action: "clear" }, new AbortController().signal, undefined, ctx());
  } finally {
    if (originalToken === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = originalToken;
  }
});

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
