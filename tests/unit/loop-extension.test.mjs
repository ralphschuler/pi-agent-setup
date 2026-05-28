import assert from "node:assert/strict";
import test from "node:test";

import loopExtension, {
  LOOP_NEXT_ITERATION_DELAY_MS,
  LOOP_USAGE,
  MAX_LOOP_SENDS,
  parseLoopArgs,
  validateLoopPrompt,
} from "../../extensions/loop/index.ts";
import { readText } from "../helpers.mjs";

const TEST_LOOP_NEXT_ITERATION_DELAY_MS = 20;

test("loop argument parser treats commands and explicit prompt separator correctly", () => {
  assert.deepEqual(parseLoopArgs(""), { action: "start" });
  assert.deepEqual(parseLoopArgs("stop"), { action: "stop" });
  assert.deepEqual(parseLoopArgs("status"), { action: "status" });
  assert.deepEqual(parseLoopArgs("help"), { action: "help" });
  assert.deepEqual(parseLoopArgs("start do work"), { action: "start", prompt: "do work" });
  assert.deepEqual(parseLoopArgs("-- stop"), { action: "start", prompt: "stop" });
  assert.deepEqual(parseLoopArgs("/plan docs"), { action: "start", prompt: "/plan docs" });
});

test("loop timing constants keep production delay explicit", () => {
  assert.equal(LOOP_NEXT_ITERATION_DELAY_MS, 5000);
});

test("loop validation blocks recursive /loop prompts but allows other slash prompts", () => {
  assert.equal(
    validateLoopPrompt("/loop stop"),
    "Loop prompts cannot start with /loop because that would recursively control the loop command.",
  );
  assert.equal(
    validateLoopPrompt("  /loop keep going"),
    "Loop prompts cannot start with /loop because that would recursively control the loop command.",
  );
  assert.equal(validateLoopPrompt("/plan continue"), undefined);
  assert.equal(validateLoopPrompt("keep going"), undefined);
});

test("/loop starts from a bare editor prompt when idle", async () => {
  const harness = installLoop({ idle: true, editorText: "keep going" });
  await harness.command.handler("", harness.ctx);

  assert.deepEqual(harness.editorPrompts, ["Prompt to repeat with /loop"]);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0].message, "keep going");
  assert.equal(harness.sent[0].options, undefined);
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: `loop: 1/${MAX_LOOP_SENDS}` });
});

test("/loop supports start, status, stop, help, and -- prompt mode", async () => {
  const harness = installLoop({ idle: true });

  await harness.command.handler("status", harness.ctx);
  assert.match(harness.notifications.at(-1).message, /Loop inactive/);

  await harness.command.handler("-- stop", harness.ctx);
  assert.equal(harness.sent.at(-1).message, "stop");

  await harness.command.handler("status", harness.ctx);
  assert.match(harness.notifications.at(-1).message, /Loop active/);
  assert.match(harness.notifications.at(-1).message, /1\/50/);

  await harness.command.handler("help", harness.ctx);
  assert.equal(harness.notifications.at(-1).message, LOOP_USAGE);

  await harness.command.handler("stop", harness.ctx);
  assert.match(harness.notifications.at(-1).message, /Loop stopped/);
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: undefined });

  await harness.emitAgentEndAndBecomeIdle();
  assert.equal(harness.sent.length, 1);
});

test("/loop waits for idle after agent_end instead of queuing a follow-up", async () => {
  const harness = installLoop({ idle: false });

  await harness.command.handler("repeat me", harness.ctx);
  assert.equal(harness.sent.length, 0);
  assert.match(harness.notifications.at(-1).message, /after the current agent turn/);

  await harness.emit("agent_end");
  assert.equal(harness.sent.length, 0, "must not send during agent_end while runtime is still streaming");

  await waitForScheduledSend();
  assert.equal(harness.sent.length, 0, "must keep waiting when the first deferred check still sees busy runtime");

  harness.setIdle(true);
  await waitForIdleRetry();
  assert.equal(harness.sent.length, 1);
  assert.deepEqual(harness.sent[0], { message: "repeat me", options: undefined });
  assert.equal(harness.sendIdleStates.at(-1), true, "loop sends only after runtime is idle");

  harness.setIdle(false);
  await harness.emit("agent_end");
  assert.equal(harness.sent.length, 1, "repeat must wait until the runtime is idle again");

  await waitForScheduledSend();
  assert.equal(harness.sent.length, 1, "repeat must stay pending if idle is delayed again");

  harness.setIdle(true);
  await waitForIdleRetry();
  await waitForNextIterationDelay();
  assert.equal(harness.sent.length, 2);
  assert.deepEqual(harness.sent[1], { message: "repeat me", options: undefined });
  assert.deepEqual(
    harness.sent.map((item) => item.options),
    [undefined, undefined],
  );
  assert.deepEqual(harness.sendIdleStates, [true, true]);
});

test("/loop starts each repeat in a new session after a delay", async () => {
  const harness = installLoop({ idle: true });

  await harness.command.handler("new session repeat", harness.ctx);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.newSessions.length, 0);

  await harness.emitAgentEndAndBecomeIdle();
  assert.equal(harness.sent.length, 1, "next iteration must not start before the configured delay");
  assert.equal(harness.newSessions.length, 0);

  await waitForNextIterationDelay();
  assert.equal(harness.newSessions.length, 1);
  assert.equal(harness.newSessions[0].parentSession, "session-0.jsonl");
  assert.deepEqual(harness.sessionShutdowns, [{ reason: "new", targetSessionFile: "session-1.jsonl" }]);
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["new session repeat", "new session repeat"],
  );
  assert.equal(harness.sendSessionFiles[1], "session-1.jsonl");
});

test("/loop keeps running after loop-created new sessions reload extensions", async () => {
  const harness = installLoop({ idle: true, reloadExtensionOnNewSession: true });

  await harness.command.handler("survive extension reload", harness.ctx);
  assert.equal(harness.sent.length, 1);

  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.equal(harness.sent.length, 2);
  assert.equal(harness.newSessions.length, 1);

  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.equal(harness.sent.length, 3, "fresh extension instance must inherit the active loop");
  assert.equal(harness.newSessions.length, 2);
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["survive extension reload", "survive extension reload", "survive extension reload"],
  );
  assert.deepEqual(harness.sendSessionFiles, ["session-0.jsonl", "session-1.jsonl", "session-2.jsonl"]);

  await harness.command.handler("status", harness.ctx);
  assert.match(harness.notifications.at(-1).message, /Loop active/);
  await harness.command.handler("stop", harness.ctx);
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: undefined });
});

test("duplicate /loop extension instances do not double-send repeats", async () => {
  const harness = installLoop({ idle: true, duplicateExtensionInstances: true, useDefaultStateKey: true });

  await harness.command.handler("single repeat", harness.ctx);
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["single repeat"],
  );

  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["single repeat", "single repeat"],
  );
  assert.equal(harness.newSessions.length, 1);

  await harness.command.handler("stop", harness.ctx);
});

test("/loop replaces an active loop and resets the counter", async () => {
  const harness = installLoop({ idle: true });

  await harness.command.handler("first", harness.ctx);
  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["first", "first"],
  );

  await harness.command.handler("second", harness.ctx);
  assert.equal(harness.sent.at(-1).message, "second");
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: `loop: 1/${MAX_LOOP_SENDS}` });
  assert.match(harness.notifications.at(-1).message, /Loop replaced/);

  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.deepEqual(
    harness.sent.map((item) => item.message),
    ["first", "first", "second", "second"],
  );
});

test("/loop enforces the emergency cap and stops", async () => {
  const harness = installLoop({ idle: true });

  await harness.command.handler("bounded", harness.ctx);
  for (let index = 1; index < MAX_LOOP_SENDS; index++) {
    await harness.emitAgentEndAndBecomeIdle();
    await waitForNextIterationDelay();
  }
  assert.equal(harness.sent.length, MAX_LOOP_SENDS);
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: `loop: ${MAX_LOOP_SENDS}/${MAX_LOOP_SENDS}` });

  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.equal(harness.sent.length, MAX_LOOP_SENDS);
  assert.match(harness.notifications.at(-1).message, /emergency cap/);
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: undefined });
});

test("/loop blocks recursive prompt text and handles bare non-UI usage", async () => {
  const blocked = installLoop({ idle: true });
  await blocked.command.handler("/loop stop", blocked.ctx);
  assert.equal(blocked.sent.length, 0);
  assert.match(blocked.notifications.at(-1).message, /cannot start with \/loop/);

  const nonUi = installLoop({ idle: true, hasUI: false });
  await nonUi.command.handler("", nonUi.ctx);
  assert.equal(nonUi.sent.length, 0);
  assert.equal(nonUi.notifications.at(-1).message, LOOP_USAGE);
});

test("/loop resets on manual new-session shutdown after a loop-created session starts", async () => {
  const harness = installLoop({ idle: true, blockReplacementSend: true });

  await harness.command.handler("manual shutdown", harness.ctx);
  await harness.emitAgentEndAndBecomeIdle();
  await waitForNextIterationDelay();
  assert.equal(harness.newSessions.length, 1);
  assert.equal(harness.sent.length, 1, "replacement send is intentionally still pending");

  await harness.emit("session_shutdown", { reason: "new", targetSessionFile: "manual-session.jsonl" });
  assert.deepEqual(harness.statuses.at(-1), { name: "loop", value: undefined });
});

test("/loop clears scheduled in-memory sends on stop and session shutdown", async () => {
  const stopped = installLoop({ idle: true });
  await stopped.command.handler("temporary", stopped.ctx);
  await stopped.emit("agent_end");
  await stopped.command.handler("stop", stopped.ctx);
  stopped.setIdle(true);
  await waitForNextIterationDelay();
  assert.equal(stopped.sent.length, 1);
  assert.deepEqual(stopped.statuses.at(-1), { name: "loop", value: undefined });

  const shutdown = installLoop({ idle: true });
  await shutdown.command.handler("temporary", shutdown.ctx);
  await shutdown.emit("agent_end");
  await shutdown.emit("session_shutdown");
  shutdown.setIdle(true);
  await waitForNextIterationDelay();
  assert.equal(shutdown.sent.length, 1);
  assert.deepEqual(shutdown.statuses.at(-1), { name: "loop", value: undefined });
});

test("loop extension is documented and discoverable", () => {
  const source = readText("extensions/loop/index.ts");
  const docs = readText("docs/extensions/loop.md");
  const index = readText("docs/extensions/index.md");
  const readme = readText("README.md");
  const mkdocs = readText("mkdocs.yml");

  for (const phrase of [
    'pi.registerCommand("loop"',
    "MAX_LOOP_SENDS",
    "LOOP_NEXT_ITERATION_DELAY_MS",
    "agent_end",
    "session_shutdown",
    "sendUserMessage",
    "newSession",
  ]) {
    assert.ok(source.includes(phrase), `source missing ${phrase}`);
  }
  assert.equal(source.includes('deliverAs: "followUp"'), false, "loop must not queue follow-up/steering prompts");

  for (const phrase of [
    "/loop <prompt>",
    "/loop stop",
    "new session",
    "5 seconds",
    "emergency cap",
    "in-memory",
    "Slash-looking prompts",
  ]) {
    assert.ok(docs.includes(phrase), `docs missing ${phrase}`);
  }

  assert.ok(index.includes("`/loop <prompt>`"));
  assert.ok(readme.includes("extensions/loop/"));
  assert.ok(readme.includes("/loop <prompt>"));
  assert.ok(mkdocs.includes("extensions/loop.md"));
});

function installLoop({
  idle = true,
  editorText = "editor prompt",
  hasUI = true,
  blockReplacementSend = false,
  reloadExtensionOnNewSession = false,
  duplicateExtensionInstances = false,
  useDefaultStateKey = false,
} = {}) {
  let commands = new Map();
  let handlers = new Map();
  const stateKey = useDefaultStateKey ? undefined : Symbol("loop-test");
  const sent = [];
  const sendIdleStates = [];
  const sendSessionFiles = [];
  const statuses = [];
  const notifications = [];
  const editorPrompts = [];
  const newSessions = [];
  const sessionShutdowns = [];
  let currentIdle = idle;
  let sessionIndex = 0;
  let sessionFile = "session-0.jsonl";
  let command;
  let ctx;

  const sendUserMessage = async (message, options) => {
    if (blockReplacementSend && sessionFile !== "session-0.jsonl") return new Promise(() => {});
    sent.push({ message, options });
    sendIdleStates.push(currentIdle);
    sendSessionFiles.push(sessionFile);
  };

  const makeCtx = () => ({
    hasUI,
    isIdle: () => currentIdle,
    sessionManager: {
      getSessionFile: () => sessionFile,
    },
    async newSession(options = {}) {
      const targetSessionFile = `session-${sessionIndex + 1}.jsonl`;
      newSessions.push({ parentSession: options.parentSession, targetSessionFile });
      await emitWithContext("session_shutdown", { reason: "new", targetSessionFile }, ctx);
      sessionShutdowns.push({ reason: "new", targetSessionFile });
      sessionIndex += 1;
      sessionFile = targetSessionFile;
      const replacementCtx = makeCtx();
      ctx = replacementCtx;
      if (reloadExtensionOnNewSession) {
        command = registerLoopInstance();
      }
      await emitWithContext("session_start", { reason: "new", previousSessionFile: options.parentSession }, replacementCtx);
      await options.withSession?.(replacementCtx);
      return { cancelled: false };
    },
    sendUserMessage,
    ui: {
      editor: async (prompt) => {
        editorPrompts.push(prompt);
        return editorText;
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
      setStatus(name, value) {
        statuses.push({ name, value });
      },
    },
  });

  function registerLoopInstance({ reset = true } = {}) {
    if (reset) {
      commands = new Map();
      handlers = new Map();
    }
    const pi = {
      registerCommand(name, registeredCommand) {
        commands.set(name, registeredCommand);
      },
      on(name, handler) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(handler);
      },
      sendUserMessage(message, options) {
        void sendUserMessage(message, options);
      },
    };

    loopExtension(pi, { idleRetryMs: 1, nextIterationDelayMs: TEST_LOOP_NEXT_ITERATION_DELAY_MS, stateKey });
    const registeredCommand = commands.get("loop");
    assert.ok(registeredCommand, "loop command registered");
    return registeredCommand;
  }

  ctx = makeCtx();
  command = registerLoopInstance();
  if (duplicateExtensionInstances) {
    command = registerLoopInstance({ reset: false });
  }

  async function emitWithContext(name, event = {}, eventCtx = ctx) {
    for (const handler of handlers.get(name) || []) await handler(event, eventCtx);
  }

  return {
    get command() {
      return command;
    },
    get ctx() {
      return ctx;
    },
    sent,
    sendIdleStates,
    sendSessionFiles,
    statuses,
    notifications,
    editorPrompts,
    newSessions,
    sessionShutdowns,
    setIdle(value) {
      currentIdle = value;
    },
    async emit(name, event = {}) {
      await emitWithContext(name, event, ctx);
    },
    async emitAgentEndAndBecomeIdle() {
      currentIdle = false;
      await this.emit("agent_end");
      currentIdle = true;
      await waitForScheduledSend();
    },
  };
}

function waitForScheduledSend() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitForIdleRetry() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

function waitForNextIterationDelay() {
  return new Promise((resolve) => setTimeout(resolve, TEST_LOOP_NEXT_ITERATION_DELAY_MS + 5));
}
