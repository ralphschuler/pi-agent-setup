import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

const corePolicyFiles = [
  "extensions/subagent-orchestrator/index.ts",
  "extensions/subagents/index.ts",
  "skills/pi-subagents/SKILL.md",
  "docs/extensions/subagent-orchestrator.md",
  "docs/extensions/subagents.md",
];

const promptPolicyFiles = [
  "prompts/pick-issue.md",
  "prompts/to-issue.md",
  "prompts/to-pr.md",
  "prompts/standup.md",
  "prompts/research.md",
  "prompts/review.md",
];

test("subagent guidance requires list-first delegation and missing-specialist creation", () => {
  for (const file of corePolicyFiles) {
    const source = readText(file);

    assert.match(source, /subagent action=list|action: "list"|action=list/, `${file} must require listing specialists first`);
    assert.match(source, /no matching specialist exists/, `${file} must cover missing specialist creation`);
    assert.match(source, /narrow custom specialist|narrow, task-specific agents/, `${file} must require narrow custom specialists`);
    assert.match(source, /simple tasks/, `${file} must avoid mandatory subagents for simple work`);
  }
});

test("dynamic subagent creation documents required specialist contract fields", () => {
  for (const file of corePolicyFiles) {
    const source = readText(file);

    for (const phrase of ["description", "tool limits", "success criteria", "escalation rules", "output contract"]) {
      assert.ok(source.includes(phrase), `${file} missing ${phrase}`);
    }
  }
});

test("prompt templates preserve parent-agent responsibility when using subagents", () => {
  for (const file of promptPolicyFiles) {
    const source = readText(file);

    assert.ok(source.includes("subagent action=list"), `${file} must list subagents before non-trivial delegation`);
    assert.ok(source.includes("no matching specialist exists"), `${file} must mention missing specialist creation`);
    assert.match(source, /synthesis, verification/, `${file} must keep parent synthesis and verification`);
  }
});
