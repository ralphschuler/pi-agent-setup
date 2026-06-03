import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import planCommand from "../../extensions/plan/index.ts";
import { readText, tempDir } from "../helpers.mjs";

test("plan review labels the PRD action from current file state", async () => {
  const missingPrd = await prdReviewResult(tempDir("pi-plan-no-prd"));
  assert.equal(missingPrd.choices[2], "Write PRD.md");
  assert.match(missingPrd.sent.at(-1)?.message, /Create or update PRD\.md only/);

  const existingPrdDir = tempDir("pi-plan-with-prd");
  fs.writeFileSync(path.join(existingPrdDir, "PRD.md"), "# Existing PRD\n", "utf8");
  const existingPrd = await prdReviewResult(existingPrdDir);
  assert.equal(existingPrd.choices[2], "Update PRD.md");
  assert.match(existingPrd.sent.at(-1)?.message, /Create or update PRD\.md only/);
});

test("plan review defers selected follow-up until agent_end leaves the busy runtime", async () => {
  const harness = createPlanHarness({ throwWhenBusy: true });
  let idle = true;
  const ctx = {
    cwd: tempDir("pi-plan-busy-agent-end"),
    hasUI: true,
    isIdle: () => idle,
    ui: {
      editor: async () => "",
      notify() {},
      setStatus() {},
      select: async (_prompt, choices) => choices[0],
    },
  };

  await harness.commands.get("plan").handler("apply after review", ctx);
  assert.equal(harness.sent.length, 1, "kickoff prompt sends while idle");

  idle = false;
  await harness.emit(
    "agent_end",
    {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "READY FOR REVIEW\nCoverage: 100%\nPlan:\nPhase 1: apply after review" }],
        },
      ],
    },
    ctx,
  );
  assert.equal(harness.sent.length, 1, "selected follow-up must not send while agent_end is still streaming");

  idle = true;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(harness.sent.length, 2);
  assert.match(harness.sent[1].message, /Apply this approved plan now/);
  assert.equal(harness.sent[1].options, undefined, "deferred send starts a fresh turn after idle");
});

test("plan workflow enforces deep drilldown planning before approval", () => {
  const source = readText("extensions/plan/index.ts");

  for (const phrase of [
    "deep drilldown planning mode",
    "Ask questions one at a time",
    "include your recommended answer",
    "inspect first instead of asking the user",
    "Decision tree",
    "Risk sweep",
    "Coverage checklist before READY FOR REVIEW",
    "Do not modify files",
    "Apply the plan",
    "Change the plan",
    "Write PRD.md",
    "Update PRD.md",
    "plan:start",
    "startPlanning(task",
    'fs.existsSync(path.join(ctx.cwd || process.cwd(), "PRD.md"))',
    "Create or update PRD.md only",
    "Synthesize from the approved plan",
    "CONTEXT.md",
    "docs/adr/",
    "deep modules with small stable testable interfaces",
    "## Problem Statement",
    "## User Stories",
    "## Implementation Decisions",
    "Avoid volatile file paths",
    "## Testing Decisions",
    "Prefer external behavior over implementation details",
    "PRD-ready summary",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

async function prdReviewResult(cwd) {
  const harness = createPlanHarness();
  let choices = [];
  const ctx = {
    cwd,
    hasUI: true,
    isIdle: () => true,
    ui: {
      editor: async () => "",
      notify() {},
      setStatus() {},
      select: async (_prompt, nextChoices) => {
        choices = nextChoices;
        return nextChoices[2];
      },
    },
  };

  await harness.commands.get("plan").handler("write or update PRD labels", ctx);
  await harness.emit(
    "agent_end",
    {
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "READY FOR REVIEW\nCoverage: 100%\nPlan:\nPhase 1: label PRD action" }],
        },
      ],
    },
    ctx,
  );

  return { choices, sent: harness.sent };
}

function createPlanHarness({ throwWhenBusy = false } = {}) {
  const commands = new Map();
  const handlers = new Map();
  const sent = [];
  let activeCtx;
  const pi = {
    events: { on() {} },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(name, handler) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(handler);
    },
    sendUserMessage(message, options) {
      if (throwWhenBusy && activeCtx?.isIdle?.() === false && !options?.deliverAs) {
        throw new Error("Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.");
      }
      sent.push({ message, options });
    },
  };

  planCommand(pi);

  return {
    commands,
    sent,
    async emit(name, event, ctx) {
      activeCtx = ctx;
      try {
        for (const handler of handlers.get(name) || []) await handler(event, ctx);
      } finally {
        activeCtx = undefined;
      }
    },
  };
}
