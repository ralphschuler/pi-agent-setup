import assert from "node:assert/strict";
import test from "node:test";

import { buildLoopPrompt, buildLoopSessionSetup, extractMaxIterations, parseLoopResult } from "../../extensions/loop/index.ts";
import { readText } from "../helpers.mjs";

test("loop freeform max extraction uses defaults and hard cap", () => {
  assert.equal(extractMaxIterations("improve docs until clear, max 4 times"), 4);
  assert.equal(extractMaxIterations("try 7 iterations to fix tests"), 7);
  assert.equal(extractMaxIterations("do this no more than 99 times"), 20);
  assert.equal(extractMaxIterations("repeat until green"), 5);
});

test("loop result parser reads final status and summary", () => {
  assert.deepEqual(parseLoopResult("Work done.\nLOOP STATUS: done\nLOOP SUMMARY: tests pass"), {
    status: "done",
    summary: "tests pass",
  });

  assert.deepEqual(parseLoopResult("LOOP STATUS: continue\nLOOP SUMMARY: fixed one failure\nnext item"), {
    status: "continue",
    summary: "fixed one failure\nnext item",
  });

  assert.deepEqual(parseLoopResult("no marker"), {});
});

test("loop prompt requires status and summary markers", () => {
  const prompt = buildLoopPrompt({
    freeform: "refine until tests pass, max 3",
    iteration: 2,
    maxIterations: 3,
    lastSummary: "one test remains",
  });

  for (const phrase of [
    "Run /loop iteration 2/3",
    "Original freeform loop request",
    "Previous iteration summary",
    "LOOP STATUS: done|continue",
    "LOOP SUMMARY: compact handoff",
    "Use normal tool, safety, and human_in_loop rules",
  ]) {
    assert.ok(prompt.includes(phrase), `missing ${phrase}`);
  }
});

test("loop session setup carries compact summary into fresh session", () => {
  const setup = buildLoopSessionSetup({
    freeform: "keep improving docs",
    iteration: 3,
    maxIterations: 5,
    lastSummary: "docs outline improved",
  });

  for (const phrase of ["fresh session", "Iteration: 3/5", "keep improving docs", "docs outline improved"]) {
    assert.ok(setup.includes(phrase), `missing ${phrase}`);
  }
});

test("loop extension registers command and uses new sessions for iterations", () => {
  const source = readText("extensions/loop/index.ts");

  for (const phrase of [
    'pi.registerCommand("loop"',
    "Freeform /loop instructions",
    "extractMaxIterations",
    "parseLoopResult",
    "loopCtx.newSession",
    "parentSession",
    "setup",
    "withSession",
    "replacementCtx.sendUserMessage",
    "missing LOOP STATUS marker",
    "missing LOOP SUMMARY marker",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
