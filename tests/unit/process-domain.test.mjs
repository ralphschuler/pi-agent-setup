import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendBoundedLog,
  appendOutput,
  checkLogWatches,
  createManagedProcess,
  isSafeLogWatchPattern,
  normalizeLogWatches,
  safeProcessName,
  serializeProcess,
} from "../../extensions/processes/domain.ts";

function fakeChild() {
  return { stdout: { on() {} }, stderr: { on() {} }, stdin: { write() {}, end() {} }, on() {}, kill() {} };
}

function proc(overrides = {}) {
  return createManagedProcess({
    id: "1",
    name: "Dev Server",
    command: "npm run dev",
    cwd: "/tmp",
    stdoutLog: "/tmp/stdout.log",
    stderrLog: "/tmp/stderr.log",
    child: fakeChild(),
    ...overrides,
  });
}

test("process domain validates and normalizes log watches", () => {
  assert.equal(isSafeLogWatchPattern("ERROR|WARN"), true);
  assert.equal(isSafeLogWatchPattern("(a+)+$"), false);
  assert.throws(() => normalizeLogWatches([{ pattern: "(a+)+$" }]), /Unsafe log watch regex/);

  const watches = normalizeLogWatches([{ pattern: "ready", stream: "stderr", repeat: true }]);
  assert.equal(watches[0].stream, "stderr");
  assert.equal(watches[0].repeat, true);
  assert.equal(watches[0].matched, false);
});

test("process domain matches log watches and honors non-repeat watches", () => {
  const notifications = [];
  const managed = proc({ logWatches: [{ pattern: "ready", stream: "stdout" }] });
  const ui = { notify: (message, level) => notifications.push({ message, level }) };

  checkLogWatches(managed, "stdout", ["server ready"], ui);
  checkLogWatches(managed, "stdout", ["server ready again"], ui);

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /matched stdout watch: ready/);
  assert.equal(notifications[0].level, "warning");
});

test("process domain persists bounded logs with private file permissions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pi-process-log-"));
  const file = path.join(directory, "stdout.log");
  await appendBoundedLog(file, "private output\\n", 1024);
  assert.equal(await fs.readFile(file, "utf8"), "private output\\n");
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
});

test("process domain appends bounded output and serializes without child", () => {
  const managed = proc({ logWatches: [{ pattern: "WARN" }] });
  const notifications = [];
  appendOutput(managed, "stderr", Buffer.from("WARN one\nWARN two\n"), {
    ui: { notify: (message, level) => notifications.push({ message, level }) },
    logLimit: 1,
    logFileLimit: 1,
  });

  assert.deepEqual(managed.stderr, ["WARN two"]);
  assert.equal(notifications.length, 1);

  const serialized = serializeProcess(managed);
  assert.equal("child" in serialized, false);
  assert.equal(serialized.name, "Dev Server");
});

test("process domain creates safe log file name slugs", () => {
  assert.equal(safeProcessName("Dev Server!?"), "dev-server");
  assert.equal(safeProcessName("!!!"), "process");
});
