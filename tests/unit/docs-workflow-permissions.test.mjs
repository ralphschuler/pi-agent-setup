import assert from "node:assert/strict";
import test from "node:test";

import { readText } from "../helpers.mjs";

function extractTopLevelPermissions(workflow) {
  const match = workflow.match(/^permissions:\n(?<body>(?:^  .+\n?)+)/m);
  assert.ok(match?.groups?.body, "docs workflow missing top-level permissions block");
  return match.groups.body;
}

function extractDeployJob(workflow) {
  const match = workflow.match(/^  deploy:\n(?<body>(?:^    .+\n?|^      .+\n?|^        .+\n?)+)/m);
  assert.ok(match?.groups?.body, "docs workflow missing deploy job");
  return match.groups.body;
}

test("docs workflow scopes Pages and OIDC permissions to deploy job", () => {
  const workflow = readText(".github/workflows/docs.yml");
  const topLevelPermissions = extractTopLevelPermissions(workflow);
  const deployJob = extractDeployJob(workflow);

  assert.match(topLevelPermissions, /^  contents: read$/m);
  assert.doesNotMatch(topLevelPermissions, /^  pages: write$/m);
  assert.doesNotMatch(topLevelPermissions, /^  id-token: write$/m);

  assert.match(deployJob, /^    permissions:$/m);
  assert.match(deployJob, /^      pages: write$/m);
  assert.match(deployJob, /^      id-token: write$/m);
});
