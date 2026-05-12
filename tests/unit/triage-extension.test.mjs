import assert from "node:assert/strict";
import test from "node:test";

import { buildTriagePlanTask, filterTriageCandidates, formatIssueSelectItem } from "../../extensions/triage/index.ts";
import { readText } from "../helpers.mjs";

test("triage command filters open issues with no labels or the question label", () => {
  const issues = [
    { number: 1, title: "Unlabeled", labels: [] },
    { number: 2, title: "Question", labels: [{ name: "question" }] },
    { number: 3, title: "Uppercase question", labels: [{ name: "Question" }] },
    { number: 4, title: "Already triaged", labels: [{ name: "enhancement" }] },
  ];

  assert.deepEqual(
    filterTriageCandidates(issues).map((issue) => issue.number),
    [1, 2, 3],
  );
});

test("triage issue picker labels candidate reason", () => {
  assert.equal(formatIssueSelectItem({ number: 7, title: "Need details", labels: [] }).description, "no labels");
  assert.equal(formatIssueSelectItem({ number: 8, title: "Clarify", labels: [{ name: "question" }] }).description, "question label");
});

test("triage plan task is label-only and approval-gated", () => {
  const task = buildTriagePlanTask(
    {
      number: 42,
      title: "Improve docs",
      url: "https://github.com/example/repo/issues/42",
      body: "Need better docs.",
      labels: [{ name: "question", description: "Further information is requested" }],
    },
    [
      { name: "documentation", description: "Improvements or additions to documentation" },
      { name: "question", description: "Further information is requested" },
    ],
  );

  for (const phrase of [
    "Label triage only",
    "no branch, no PR, no implementation",
    "Use only existing labels",
    "Do not create or delete labels",
    "Do not close the issue",
    "After the plan is approved",
    "gh issue edit 42 --add-label",
    "gh issue edit 42 --remove-label",
    "READY FOR REVIEW",
  ]) {
    assert.ok(task.includes(phrase), `missing ${phrase}`);
  }
});

test("triage extension registers command and delegates to plan event", () => {
  const source = readText("extensions/triage/index.ts");

  for (const phrase of [
    'pi.registerCommand("triage"',
    "gh issue list",
    "gh issue view",
    "gh label list",
    "filterTriageCandidates",
    "plan:start",
    "No label-triage candidates found",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }
});
