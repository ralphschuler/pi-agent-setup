import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeFakePi, repoRoot, run } from "../helpers.mjs";

test("repository check script passes", () => {
  const result = run("bash", ["scripts/check.sh"]);
  assert.match(result.stdout, /Repository checks passed\./);
});

test("install script validates, installs the repository, links runnable aliases, and updates PATH", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");
  const shellRc = path.join(fakePi.env.HOME, ".bashrc");
  const env = { ...fakePi.env, PI_ALIAS_DIR: aliasDir, PI_SETUP_SHELL_RC: shellRc };

  run("bash", ["scripts/install.sh", "--global"], { env });
  run("bash", ["scripts/install.sh", "--global"], { env });

  assert.deepEqual(fakePi.calls(), [`install ${repoRoot}`, `install ${repoRoot}`]);
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-acp")), path.join(repoRoot, "bin", "pi-acp.mjs"));
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-screen")), path.join(repoRoot, "bin", "pi-screen.mjs"));

  const rc = fs.readFileSync(shellRc, "utf8");
  assert.match(rc, /pi-agent-setup aliases/);
  assert.match(rc, new RegExp(aliasDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((rc.match(/>>> pi-agent-setup aliases/g) ?? []).length, 1);

  const commandLookup = run("bash", ["-lc", 'source "$PI_SETUP_SHELL_RC"; command -v pi-acp; command -v pi-screen'], {
    env,
  });
  assert.deepEqual(commandLookup.stdout.trim().split("\n"), [path.join(aliasDir, "pi-acp"), path.join(aliasDir, "pi-screen")]);
});

test("install script supports project-local installs", () => {
  const fakePi = makeFakePi();

  run("bash", ["scripts/install.sh", "--local"], { env: fakePi.env });

  assert.deepEqual(fakePi.calls(), [`install -l ${repoRoot}`]);
});

test("install script refuses to replace existing aliases that point elsewhere", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.symlinkSync("/tmp/other-pi-acp", path.join(aliasDir, "pi-acp"));

  const result = run("bash", ["scripts/install.sh", "--global"], {
    check: false,
    env: { ...fakePi.env, PI_ALIAS_DIR: aliasDir },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already points to \/tmp\/other-pi-acp/);
  assert.deepEqual(fakePi.calls(), []);
});

test("uninstall script removes package entry, matching aliases, and PATH block", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");
  const shellRc = path.join(fakePi.env.HOME, ".bashrc");
  const env = { ...fakePi.env, PI_ALIAS_DIR: aliasDir, PI_SETUP_SHELL_RC: shellRc };

  run("bash", ["scripts/install.sh", "--global"], { env });
  run("bash", ["scripts/uninstall.sh", "--global"], { env });

  const rc = fs.readFileSync(shellRc, "utf8");
  assert.deepEqual(fakePi.calls(), [`install ${repoRoot}`, `remove ${repoRoot}`]);
  assert.equal(fs.existsSync(path.join(aliasDir, "pi-acp")), false);
  assert.equal(fs.existsSync(path.join(aliasDir, "pi-screen")), false);
  assert.doesNotMatch(rc, /pi-agent-setup aliases/);
});

test("update script can refresh pi, aliases, and PATH without pulling", () => {
  const fakePi = makeFakePi();
  const aliasDir = path.join(fakePi.dir, "aliases");
  const shellRc = path.join(fakePi.env.HOME, ".bashrc");

  run("bash", ["scripts/update.sh", "--no-pull", "--no-check"], {
    env: { ...fakePi.env, PI_ALIAS_DIR: aliasDir, PI_SETUP_SHELL_RC: shellRc },
  });

  assert.deepEqual(fakePi.calls(), [`update ${repoRoot}`]);
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-acp")), path.join(repoRoot, "bin", "pi-acp.mjs"));
  assert.equal(fs.readlinkSync(path.join(aliasDir, "pi-screen")), path.join(repoRoot, "bin", "pi-screen.mjs"));
  assert.match(fs.readFileSync(shellRc, "utf8"), /pi-agent-setup aliases/);
});
