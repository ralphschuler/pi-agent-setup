import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

const promptPaths = ["prompts/research.md", "prompts/review.md", "prompts/refine-codebase.md"];
const skillPaths = ["skills/code-review/SKILL.md", "skills/pi-subagents/SKILL.md", "skills/project-bootstrap/SKILL.md"];

test("plan workflow requires independently and quickly testable feature phases", () => {
  const source = readText("extensions/plan/index.ts");

  for (const phrase of [
    "small feature phases",
    "independently and quickly testable",
    "concrete validation commands/checks",
    "Broad, untestable phases are split into smaller slices",
    "Quick validation",
    "Rollback/stop point",
    "Structure the PRD into small feature phases",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});

test("planning subagent prompt requires quickly testable phases", () => {
  const source = readText("extensions/subagents/catalog.ts");

  assert.ok(source.includes("small feature phases"));
  assert.ok(source.includes("independently and quickly testable"));
  assert.ok(source.includes("quick validation commands/checks"));
  assert.ok(source.includes("rollback/stop points"));
});

test("prompt templates require quickly testable feature phases for plans and PRDs", () => {
  for (const promptPath of promptPaths) {
    const text = readText(promptPath);

    assert.ok(text.includes("feature phases"), `${promptPath} must mention feature phases`);
    assert.match(text, /independently and quickly testable/i, `${promptPath} must require quick independent validation`);
    assert.match(text, /validation (commands\/checks|per phase)|commands or checks/i, `${promptPath} must require validation checks`);
  }
});

test("skills reinforce quickly testable feature phases where planning applies", () => {
  for (const skillPath of skillPaths) {
    const text = readText(skillPath);

    assert.ok(text.includes("feature phases"), `${skillPath} must mention feature phases`);
    assert.match(text, /independently and quickly testable|validated independently/i, skillPath);
  }
});
