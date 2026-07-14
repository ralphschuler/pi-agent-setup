import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import cronjobs, { parseMarkdown, renderMarkdown } from "../../extensions/cronjobs/index.ts";
import { computeNextRun, parseSchedule, refreshJobNextRun } from "../../extensions/cronjobs/domain.ts";

test("cron schedule validation rejects zero and out-of-range values", () => {
  for (const value of ["every 0 minutes", "daily 24:00", "*/0 * * * *", "60 * * * *", "1-0 * * * *", "0 0 0 * *", "0 0 * 13 *"]) {
    assert.equal(parseSchedule(value), undefined, value);
  }

  assert.deepEqual(parseSchedule("every 5 minutes"), { kind: "every" });
  assert.deepEqual(parseSchedule("*/15 * * * *"), { kind: "cron" });
});

test("cron next-run calculation stays bounded and returns valid future times", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const next = computeNextRun({ schedule: "*/15 * * * *", kind: "cron", lastRunAt: undefined }, from);

  assert.ok(next instanceof Date);
  assert.equal(next.toISOString(), "2026-01-01T00:15:00.000Z");
});

test("cron extension recovers overdue jobs and retries the same pending dispatch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-test-"));
  const storePath = path.join(root, "cronjobs.md");
  let current = new Date("2026-01-02T00:00:00.000Z");
  let failOnce = true;
  const sent = [];
  const handlers = new Map();
  let tool;
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool(definition) {
      tool = definition;
    },
    sendUserMessage(messages) {
      sent.push(messages[0].text);
      if (failOnce) {
        failOnce = false;
        throw new Error("simulated delivery failure");
      }
    },
  };
  await fs.writeFile(
    storePath,
    renderMarkdown([
      {
        id: 1,
        name: "recovery",
        task: "check recovery",
        schedule: "2026-01-01T00:00:00.000Z",
        kind: "once",
        enabled: true,
        createdAt: current.toISOString(),
        updatedAt: current.toISOString(),
        cwd: "/repo-a",
        sessionId: "session-a",
      },
    ]),
  );
  cronjobs(pi, { storePath, now: () => current, retryDelayMs: 1 });
  const sessionContext = {
    hasUI: false,
    cwd: "/repo-a",
    sessionManager: { getSessionId: () => "session-a", getSessionFile: () => "/sessions/session-a.jsonl" },
  };
  await handlers.get("session_start")({}, sessionContext);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /Dispatch: [0-9a-f-]{36}/);
  const firstDispatch = sent[0].match(/Dispatch: ([0-9a-f-]{36})/)?.[1];
  let saved = parseMarkdown(await fs.readFile(storePath, "utf8"))[0];
  assert.equal(saved.enabled, true);
  assert.equal(saved.dispatchStatus, "pending");
  assert.equal(saved.dispatchAttempts, 1);

  current = new Date(current.getTime() + 2);
  await tool.execute("test", { action: "run_due" }, undefined, undefined, sessionContext);
  assert.equal(sent.length, 2);
  assert.match(sent[1], new RegExp(`Dispatch: ${firstDispatch}`));
  saved = parseMarkdown(await fs.readFile(storePath, "utf8"))[0];
  assert.equal(saved.enabled, false);
  assert.equal(saved.dispatchStatus, "sent");
  assert.equal(saved.dispatchAttempts, 2);
  await handlers.get("session_shutdown")();
});

test("cron dispatch stays isolated to the originating session", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-session-isolation-"));
  const storePath = path.join(root, "cronjobs.md");
  const current = new Date("2026-01-02T00:00:00.000Z");
  const sent = [];
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool() {},
    sendUserMessage(messages) {
      sent.push(messages[0].text);
    },
  };

  await fs.writeFile(
    storePath,
    renderMarkdown([
      {
        id: 1,
        name: "session-a-job",
        task: "only session A",
        schedule: "2026-01-01T00:00:00.000Z",
        kind: "once",
        enabled: true,
        createdAt: current.toISOString(),
        updatedAt: current.toISOString(),
        cwd: "/repo-a",
        sessionId: "session-a",
      },
    ]),
  );

  cronjobs(pi, { storePath, now: () => current });
  const sessionStart = handlers.get("session_start");
  const sessionShutdown = handlers.get("session_shutdown");
  await sessionStart(
    {},
    {
      hasUI: false,
      cwd: "/repo-b",
      sessionManager: { getSessionId: () => "session-b", getSessionFile: () => "/sessions/session-b.jsonl" },
    },
  );
  assert.equal(sent.length, 0);
  await sessionShutdown();

  await sessionStart(
    {},
    {
      hasUI: false,
      cwd: "/repo-a",
      sessionManager: { getSessionId: () => "session-a", getSessionFile: () => "/sessions/session-a.jsonl" },
    },
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0], /only session A/);
  await sessionShutdown();
});

test("legacy unscoped jobs are not claimed by a new session", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-legacy-scope-"));
  const storePath = path.join(root, "cronjobs.md");
  const sent = [];
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool() {},
    sendUserMessage(messages) {
      sent.push(messages[0].text);
    },
  };
  await fs.writeFile(
    storePath,
    renderMarkdown([
      {
        id: 1,
        name: "legacy",
        task: "must not leak",
        schedule: "2026-01-01T00:00:00.000Z",
        kind: "once",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );

  cronjobs(pi, { storePath, now: () => new Date("2026-01-02T00:00:00.000Z") });
  await handlers.get("session_start")(
    {},
    {
      hasUI: false,
      cwd: "/new-repo",
      sessionManager: { getSessionId: () => "new-session", getSessionFile: () => "/sessions/new-session.jsonl" },
    },
  );
  assert.deepEqual(sent, []);
  await handlers.get("session_shutdown")();
});

test("scheduled jobs persist their originating session scope", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-scope-"));
  const storePath = path.join(root, "cronjobs.md");
  let tool;
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool(definition) {
      tool = definition;
    },
    sendUserMessage() {},
  };
  const ctx = {
    hasUI: false,
    cwd: "/repo-a",
    sessionManager: { getSessionId: () => "session-a", getSessionFile: () => "/sessions/session-a.jsonl" },
  };

  cronjobs(pi, { storePath, now: () => new Date("2026-01-01T00:00:00.000Z") });
  await handlers.get("session_start")({}, ctx);
  await tool.execute("test", { action: "schedule", name: "scoped", task: "task", schedule: "every 1 day" }, undefined, undefined, ctx);

  const saved = parseMarkdown(await fs.readFile(storePath, "utf8"))[0];
  assert.equal(saved.cwd, "/repo-a");
  assert.equal(saved.sessionId, "session-a");
  await handlers.get("session_shutdown")();
});

test("cron scheduling rejects non-persistent sessions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-nonpersistent-"));
  const storePath = path.join(root, "cronjobs.md");
  let tool;
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool(definition) {
      tool = definition;
    },
    sendUserMessage() {},
  };
  const ctx = { hasUI: false, cwd: "/repo-a", sessionManager: { getSessionId: () => "memory-session" } };

  cronjobs(pi, { storePath, now: () => new Date("2026-01-01T00:00:00.000Z") });
  await handlers.get("session_start")({}, ctx);
  const result = await tool.execute(
    "test",
    { action: "schedule", name: "memory", task: "task", schedule: "every 1 day" },
    undefined,
    undefined,
    ctx,
  );

  assert.match(result.content[0].text, /active persistent pi session/);
  await handlers.get("session_shutdown")();
});

test("overdue one-shot jobs recover on the next active session", () => {
  const now = new Date("2026-01-02T00:00:00.000Z");
  const next = refreshJobNextRun({ schedule: "2026-01-01T00:00:00.000Z", kind: "once", enabled: true }, now);

  assert.equal(next?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(
    refreshJobNextRun({ schedule: "2026-01-01T00:00:00.000Z", kind: "once", enabled: true, lastRunAt: "2026-01-01T00:00:01.000Z" }, now),
    undefined,
  );
  assert.equal(
    refreshJobNextRun({ schedule: "2026-01-01T00:00:00.000Z", kind: "once", enabled: true, dispatchStatus: "pending" }, now)?.toISOString(),
    now.toISOString(),
  );
});
