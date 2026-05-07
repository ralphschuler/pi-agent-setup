import assert from "node:assert/strict";
import test from "node:test";

import waitExtension, { delay, MAX_WAIT_SECONDS, MIN_WAIT_SECONDS, normalizeWaitSeconds } from "../../extensions/wait/index.ts";
import { readText } from "../helpers.mjs";

test("wait tool registers bounded agent-facing delay", () => {
  const source = readText("extensions/wait/index.ts");
  let registered;

  waitExtension({ registerTool: (tool) => (registered = tool) });

  assert.equal(registered.name, "wait");
  assert.equal(registered.promptSnippet, "Delay the agent response for a bounded amount of time.");
  assert.match(registered.promptGuidelines.join("\n"), /Use wait after starting finite background tasks with process/);
  assert.match(source, /AbortSignal/);
});

test("wait tool normalizes defaults and validates bounds", () => {
  assert.equal(normalizeWaitSeconds(undefined), 30);
  assert.equal(normalizeWaitSeconds(1), MIN_WAIT_SECONDS);
  assert.equal(normalizeWaitSeconds(600), MAX_WAIT_SECONDS);
  assert.equal(normalizeWaitSeconds(1.4), 1);
  assert.equal(normalizeWaitSeconds(1.5), 2);

  assert.throws(() => normalizeWaitSeconds(0), /between 1 and 600/);
  assert.throws(() => normalizeWaitSeconds(0.6), /between 1 and 600/);
  assert.throws(() => normalizeWaitSeconds(600.4), /between 1 and 600/);
  assert.throws(() => normalizeWaitSeconds(601), /between 1 and 600/);
  assert.throws(() => normalizeWaitSeconds(Number.NaN), /finite number/);
});

test("wait tool executes, resolves, and aborts cleanly", async () => {
  let registered;
  waitExtension({ registerTool: (tool) => (registered = tool) });
  const result = await registered.execute("wait-1", { seconds: 1 });
  assert.equal(result.content[0].text, "Waited 1s.");
  assert.deepEqual(result.details, { seconds: 1 });

  await delay(1);

  const controller = new AbortController();
  const promise = delay(1000, controller.signal);
  controller.abort();
  await assert.rejects(promise, /wait cancelled/);

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(delay(1, aborted.signal), /wait cancelled/);
});
