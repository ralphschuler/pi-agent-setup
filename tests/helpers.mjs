import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    input: options.input,
    encoding: "utf8",
    shell: false,
  });

  if (options.check !== false && result.status !== 0) {
    assert.fail(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `status: ${result.status}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    );
  }

  return result;
}

export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

export function makeFakePi() {
  const dir = tempDir("pi-agent-setup-fake-pi");
  const logPath = path.join(dir, "pi.log");
  const executable = path.join(dir, "pi");

  fs.writeFileSync(executable, `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "$*" >> ${JSON.stringify(logPath)}\n`, "utf8");
  fs.chmodSync(executable, 0o755);

  return {
    dir,
    logPath,
    env: {
      PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
      HOME: path.join(dir, "home"),
      npm_config_cache: path.join(dir, "npm-cache"),
    },
    calls() {
      if (!fs.existsSync(logPath)) return [];
      return fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    },
  };
}
