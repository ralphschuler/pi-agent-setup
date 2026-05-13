import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { repoRoot, tempDir } from "../helpers.mjs";
import { attachTarget, defaultName, managedName, namedSession, parseScreenList, pickerKeyAction } from "../../bin/pi-screen.mjs";

function fakeBin() {
  const dir = tempDir("pi-screen-bin");
  const logPath = path.join(dir, "screen.log");
  const screen = path.join(dir, "screen");
  fs.writeFileSync(
    screen,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-ls" ]]; then
  printf '%b' "\${PI_FAKE_SCREEN_LS:-No Sockets found.\\n}"
  exit 0
fi
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
`,
    "utf8",
  );
  fs.chmodSync(screen, 0o755);

  const pi = path.join(dir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  fs.chmodSync(pi, 0o755);

  const git = path.join(dir, "git");
  fs.writeFileSync(
    git,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "rev-parse" && "\${2:-}" == "--show-toplevel" && -n "\${PI_FAKE_GIT_ROOT:-}" ]]; then
  printf '%s\\n' "\${PI_FAKE_GIT_ROOT}"
  exit 0
fi
exit 1
`,
    "utf8",
  );
  fs.chmodSync(git, 0o755);
  return { dir, logPath };
}

function runPiScreen(args, options = {}) {
  return spawnSync(process.execPath, [path.join(repoRoot, "bin/pi-screen.mjs"), ...args], {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("parseScreenList extracts managed session names and statuses", () => {
  const sessions = parseScreenList("There is a screen on:\n\t1234.pi-demo-abcd1234\t(Detached)\n\t999.other\t(Attached)\n");

  assert.deepEqual(sessions, [
    { full: "1234.pi-demo-abcd1234", name: "pi-demo-abcd1234", status: "Detached" },
    { full: "999.other", name: "other", status: "Attached" },
  ]);
});

test("pi-screen --help documents repo and outside-repo behavior", () => {
  const result = runPiScreen(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /inside a Git repository: attach existing live repo session or create one/);
  assert.match(result.stdout, /outside a Git repository: show a picker for live pi-screen sessions only/);
});

test("inside a repository starts the default repo session when none exists", () => {
  const fake = fakeBin();
  const result = runPiScreen(["--dry-run", "--", "hello"], {
    env: { PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`, PI_FAKE_GIT_ROOT: repoRoot },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), new RegExp(`^screen -S ${defaultName(repoRoot, repoRoot)} pi hello$`));
});

test("inside a repository attaches existing session and warns when pi args are ignored", () => {
  const fake = fakeBin();
  const name = defaultName(repoRoot, repoRoot);
  const result = runPiScreen(["--", "new prompt"], {
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_GIT_ROOT: repoRoot,
      PI_FAKE_SCREEN_LS: `There is a screen on:\n\t1234.${name}\t(Detached)\n`,
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stderr, /pi args ignored/);
  assert.equal(fs.readFileSync(fake.logPath, "utf8").trim(), `-r 1234.${name}`);
});

test("inside a repository ignores a dead repo session and starts a fresh one", () => {
  const fake = fakeBin();
  const name = defaultName(repoRoot, repoRoot);
  const result = runPiScreen(["--dry-run"], {
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_GIT_ROOT: repoRoot,
      PI_FAKE_SCREEN_LS: `There are screens on:\n\t1234.${name}\t(Dead ???)\n`,
    },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), `screen -S ${name} pi`);
});

test("--list omits dead pi-screen sessions even when names contain status words", () => {
  const fake = fakeBin();
  const result = runPiScreen(["--list"], {
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_SCREEN_LS:
        "There are screens on:\n\t1234.pi-alpha-aaaaaaaa\t(Dead ???)\n\t2345.pi-attached-aaaaaaaa\t(Dead ???)\n\t3456.pi-detached-aaaaaaaa\t(Dead ???)\n\t5678.pi-beta-bbbbbbbb\t(Detached)\n",
    },
  });

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /pi-alpha-aaaaaaaa/);
  assert.doesNotMatch(result.stdout, /pi-attached-aaaaaaaa/);
  assert.doesNotMatch(result.stdout, /pi-detached-aaaaaaaa/);
  assert.match(result.stdout, /pi-beta-bbbbbbbb/);
});

test("--detach creates a detached named pi-screen session", () => {
  const fake = fakeBin();
  const result = runPiScreen(["--name", "docs", "--new", "--detach", "--", "write docs"], {
    env: { PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`, PI_FAKE_GIT_ROOT: repoRoot },
  });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(fake.logPath, "utf8").trim(), `-dmS ${managedName("docs", `${repoRoot}:docs`)} pi write docs`);
});

test("--name can attach an exact listed pi-screen session name", () => {
  const fake = fakeBin();
  const existing = "pi-alpha-aaaaaaaa";
  const result = runPiScreen(["--name", existing], {
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_GIT_ROOT: repoRoot,
      PI_FAKE_SCREEN_LS: `There is a screen on:\n\t1234.${existing}\t(Detached)\n`,
    },
  });

  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(fake.logPath, "utf8").trim(), `-r 1234.${existing}`);
});

test("--new avoids duplicate screen names when a managed session exists", () => {
  const fake = fakeBin();
  const existing = managedName("docs", `${repoRoot}:docs`);
  const result = runPiScreen(["--name", "docs", "--new"], {
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_GIT_ROOT: repoRoot,
      PI_FAKE_SCREEN_LS: `There is a screen on:\n\t1234.${existing}\t(Detached)\n`,
    },
  });

  assert.equal(result.status, 0);
  const logged = fs.readFileSync(fake.logPath, "utf8").trim();
  assert.match(logged, new RegExp(`^-S ${existing}-[a-z0-9]+ pi$`));
});

test("namedSession preserves exact managed names from the screen list", () => {
  const sessions = [{ full: "1234.pi-alpha-aaaaaaaa", name: "pi-alpha-aaaaaaaa", status: "Detached" }];

  assert.equal(namedSession("pi-alpha-aaaaaaaa", "ignored", sessions), "pi-alpha-aaaaaaaa");
});

test("attachTarget uses the full screen id when screen -ls prefixes a pid", () => {
  assert.equal(attachTarget({ full: "1234.pi-alpha-aaaaaaaa", name: "pi-alpha-aaaaaaaa" }), "1234.pi-alpha-aaaaaaaa");
  assert.equal(attachTarget({ name: "pi-alpha-aaaaaaaa" }), "pi-alpha-aaaaaaaa");
});

test("picker key handling uses arrows, escape, and enter without line confirmation", () => {
  assert.deepEqual(pickerKeyAction(0, 3, { name: "down" }), { type: "move", selected: 1 });
  assert.deepEqual(pickerKeyAction(1, 3, { name: "up" }), { type: "move", selected: 0 });
  assert.deepEqual(pickerKeyAction(0, 3, { name: "up" }), { type: "move", selected: 0 });
  assert.deepEqual(pickerKeyAction(2, 3, { name: "down" }), { type: "move", selected: 2 });
  assert.deepEqual(pickerKeyAction(1, 3, { name: "escape" }), { type: "quit", selected: 1 });
  assert.deepEqual(pickerKeyAction(1, 3, { name: "return" }), { type: "choose", selected: 1 });
});

test("outside a repository non-TTY fallback lists only pi-screen sessions", () => {
  const fake = fakeBin();
  const cwd = tempDir("pi-screen-outside");
  const result = runPiScreen([], {
    cwd,
    env: {
      PATH: `${fake.dir}${path.delimiter}${process.env.PATH}`,
      PI_FAKE_SCREEN_LS: "There are screens on:\n\t1234.pi-alpha-aaaaaaaa\t(Detached)\n\t999.tmuxish\t(Detached)\n",
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /pi-alpha-aaaaaaaa/);
  assert.doesNotMatch(result.stdout, /tmuxish/);
  assert.match(result.stdout, /Run `pi-screen --name <name> --new`/);
});

test("missing screen fails closed with clear error", () => {
  const dir = tempDir("pi-screen-no-screen");
  const result = runPiScreen(["--list"], { env: { PATH: dir } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GNU screen not found/);
});

test("missing pi fails closed with clear error", () => {
  const dir = tempDir("pi-screen-no-pi");
  const screen = path.join(dir, "screen");
  fs.writeFileSync(screen, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  fs.chmodSync(screen, 0o755);

  const result = runPiScreen(["--list"], { env: { PATH: dir } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /pi CLI not found/);
});
