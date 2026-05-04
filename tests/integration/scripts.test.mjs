import assert from "node:assert/strict";
import test from "node:test";

import { makeFakePi, repoRoot, run } from "../helpers.mjs";

test("repository check script passes", () => {
  const result = run("bash", ["scripts/check.sh"]);
  assert.match(result.stdout, /Repository checks passed\./);
});

test("install script validates and calls pi install globally", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/install.sh", "--global"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`install ${repoRoot}`]);
});

test("install script supports project-local installs", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/install.sh", "--local"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`install -l ${repoRoot}`]);
});

test("uninstall script removes global and local package entries", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/uninstall.sh", "--global"], { env: fakePi.env });
  run("bash", ["scripts/uninstall.sh", "--local"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`remove ${repoRoot}`, `remove -l ${repoRoot}`]);
});

test("update script can refresh pi without pulling", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/update.sh", "--no-pull", "--no-check"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`update ${repoRoot}`]);
});
