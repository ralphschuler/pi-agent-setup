import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

function extractTopLevelPermissions(workflow) {
  const match = workflow.match(/^permissions:\n(?<body>(?:^ {2}.+\n?)+)/m);
  assert.ok(match?.groups?.body, "docs workflow missing top-level permissions block");
  return match.groups.body;
}

function extractDeployJob(workflow) {
  const match = workflow.match(/^ {2}deploy:\n(?<body>(?:^ {4}.+\n?|^ {6}.+\n?|^ {8}.+\n?)+)/m);
  assert.ok(match?.groups?.body, "docs workflow missing deploy job");
  return match.groups.body;
}

test("docs workflow scopes Pages and OIDC permissions to deploy job", () => {
  const workflow = readText(".github/workflows/docs.yml");
  const topLevelPermissions = extractTopLevelPermissions(workflow);
  const deployJob = extractDeployJob(workflow);

  assert.match(topLevelPermissions, /^ {2}contents: read$/m);
  assert.doesNotMatch(topLevelPermissions, /^ {2}pages: write$/m);
  assert.doesNotMatch(topLevelPermissions, /^ {2}id-token: write$/m);

  assert.match(deployJob, /^ {4}permissions:$/m);
  assert.match(deployJob, /^ {6}pages: write$/m);
  assert.match(deployJob, /^ {6}id-token: write$/m);
});
