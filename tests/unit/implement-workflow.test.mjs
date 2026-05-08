import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

test("implement prompt requires behavior-first vertical slices and safety gates", () => {
  const prompt = readText("prompts/implement.md");

  for (const phrase of [
    "Use the `implement` skill",
    "vertical TDD-style slices",
    "public interfaces",
    "independently and quickly testable",
    "RED",
    "GREEN",
    "human_in_loop",
    "Do not ask user-facing clarification or approval questions in plain assistant text",
    "rollback/stop point",
  ]) {
    assert.ok(prompt.includes(phrase), `missing ${phrase}`);
  }
});

test("implement skill enforces one-test-one-implementation workflow", () => {
  const skill = readText("skills/implement/SKILL.md");

  for (const phrase of [
    "behavior-first",
    "public interfaces",
    "Work in vertical slices",
    "Never write all tests first and all code later",
    "Never refactor while RED",
    "independently and quickly testable",
    "Use `human_in_loop` for every user-facing clarification or approval question",
    "Do not ask those questions in plain assistant text",
  ]) {
    assert.ok(skill.includes(phrase), `missing ${phrase}`);
  }
});
