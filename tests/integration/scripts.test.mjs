import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeFakePi, repoRoot, run } from "../helpers.mjs";

test("repository check script passes", () => {
  const result = run("bash", ["scripts/check.sh"]);
  assert.match(result.stdout, /Repository checks passed\./);
});

test("install script validates, installs the repository, and links runnable aliases", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");

  run("bash", ["scripts/install.sh", "--global"], { env: { ...fakePi.env, PI_ALIAS_DIR: aliasDir } });

  assert.deepEqual(fakePi.calls(), [`install ${repoRoot}`]);
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-acp")), path.join(repoRoot, "bin", "pi-acp.mjs"));
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-screen")), path.join(repoRoot, "bin", "pi-screen.mjs"));
});

test("install script supports project-local installs", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/install.sh", "--local"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`install -l ${repoRoot}`]);
});

test("uninstall script removes package entry and matching aliases", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.symlinkSync(path.join(repoRoot, "bin", "pi-acp.mjs"), path.join(aliasDir, "pi-acp"));
  fs.symlinkSync(path.join(repoRoot, "bin", "pi-screen.mjs"), path.join(aliasDir, "pi-screen"));

  run("bash", ["scripts/uninstall.sh", "--global"], { env: { ...fakePi.env, PI_ALIAS_DIR: aliasDir } });

  assert.deepEqual(fakePi.calls(), [`remove ${repoRoot}`]);
  assert.equal(fs.existsSync(path.join(aliasDir, "pi-acp")), false);
  assert.equal(fs.existsSync(path.join(aliasDir, "pi-screen")), false);
});

test("update script can refresh pi and aliases without pulling", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");

  run("bash", ["scripts/update.sh", "--no-pull", "--no-check"], { env: { ...fakePi.env, PI_ALIAS_DIR: aliasDir } });

  assert.deepEqual(fakePi.calls(), [`update ${repoRoot}`]);
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-acp")), path.join(repoRoot, "bin", "pi-acp.mjs"));
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-screen")), path.join(repoRoot, "bin", "pi-screen.mjs"));
});
