import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeOutput } from "../../extensions/subagents/output-writer.ts";
import { buildParentContextHandoff, buildSubagentPrompt, contextModeForAgent, runAgentRecord } from "../../extensions/subagents/runner.ts";
import { runParallel } from "../../extensions/subagents/scheduler.ts";
import { readText } from "../helpers.mjs";

test("subagent orchestration is split into focused internal modules", () => {
  const entry = readText("extensions/subagents/index.ts");
  const catalog = readText("extensions/subagents/catalog.ts");
  const scheduler = readText("extensions/subagents/scheduler.ts");
  const runner = readText("extensions/subagents/runner.ts");
  const executor = readText("extensions/subagents/executor.ts");
  const writer = readText("extensions/subagents/output-writer.ts");
  const renderer = readText("extensions/subagents/renderer.ts");

  assert.match(entry, /renderCall: renderSubagentCall/);
  assert.match(entry, /renderResult: renderSubagentResult/);
  assert.match(entry, /runParallel\(pi, ctx, ctx\.cwd/);
  assert.match(entry, /runAgentRecord\(pi, ctx\.cwd/);
  assert.match(entry, /contextMode/);

  assert.match(catalog, /export const BUILTIN_AGENTS/);
  assert.match(catalog, /export async function allAgents/);
  assert.match(catalog, /readCustomAgents\(cwd\)/);
  assert.match(catalog, /\.\.\/custom-agents\/registry\.ts/);

  assert.match(scheduler, /export async function runParallel/);
  assert.match(scheduler, /export function expandTasks/);
  assert.match(scheduler, /Math\.max\(1, Math\.min\(Number\(concurrency\) \|\| 4, expanded\.length\)\)/);

  assert.match(runner, /export async function runAgentRecord/);
  assert.match(runner, /Unknown subagent '\$\{name\}'\. Use action=list first\./);
  assert.match(runner, /createSecretRedactor/);
  assert.match(runner, /redactor\.redactText\(task\)/);
  assert.match(runner, /execSubagentProcess\(\s*agent\.runtimeName/);
  assert.match(runner, /buildParentContextHandoff/);
  assert.match(runner, /fs\.mkdtemp/);
  assert.match(runner, /mode: 0o600/);
  assert.match(runner, /flag: "wx"/);

  assert.match(executor, /spawnFn\("bash", \["-c", `pi -p < \$\{shellQuote\(promptFile\)\}`\]/);
  assert.match(executor, /createSubagentLiveUpdate\(agent, task, index, stdout, stderr, onUpdate, redactText\)/);
  assert.match(executor, /redactText\(tailText\(stdout\.join\(""\), 6, 2000\)\)/);
  assert.match(executor, /setTimeout\(emit, 500\)/);

  assert.match(writer, /output\.includes\("\{index\}"\)/);
  assert.match(writer, /fs\.writeFile\(outPath, text, "utf8"\)/);

  assert.match(renderer, /export function subagentDisplayContract/);
  assert.match(renderer, /renderToolDisplayContract\(subagentDisplayContract/);
});

test("subagent prompt adds bounded parent context handoff only when provided", () => {
  const promptWithoutContext = buildSubagentPrompt("System", "Do work");
  assert.match(promptWithoutContext, /Parent task:\nDo work/);
  assert.doesNotMatch(promptWithoutContext, /Parent context handoff/);

  const promptWithContext = buildSubagentPrompt("System", "Do work", "Important prior decision");
  assert.match(promptWithContext, /Parent context handoff \(bounded, redacted; use only if relevant\):\nImportant prior decision/);
});

test("subagent parent context handoff serializes recent session context with a cap", () => {
  const ctx = {
    sessionManager: {
      buildSessionContext: () => ({
        messages: [
          { role: "user", content: "old request" },
          { role: "assistant", content: [{ type: "text", text: "old answer" }] },
          { role: "toolResult", toolName: "read", content: [{ type: "text", text: "x".repeat(200) }] },
          { role: "user", content: [{ type: "text", text: "new request" }] },
        ],
      }),
    },
  };

  const handoff = buildParentContextHandoff(ctx, 120);

  assert.ok(handoff.length <= 180, "handoff should stay bounded with truncation marker");
  assert.match(handoff, /truncated to last 120 chars/);
  assert.match(handoff, /new request/);
});

test("subagent context mode defaults to fresh unless custom agent requests fork", () => {
  assert.equal(contextModeForAgent({ defaultContext: "fork" }), "recent");
  assert.equal(contextModeForAgent({ defaultContext: "fresh" }), "fresh");
  assert.equal(contextModeForAgent({}, "recent"), "recent");
  assert.equal(contextModeForAgent({ defaultContext: "fork" }, "fresh"), "fresh");
});

test("subagent runner passes bounded parent context to child prompt without echoing it in result metadata", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-context-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const capturePath = path.join(cwd, "captured-prompt.md");
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\ncat > \"$PI_SUBAGENT_CAPTURE_PROMPT\"\nprintf 'child summary only\\n'\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const originalPath = process.env.PATH;
  const originalCapture = process.env.PI_SUBAGENT_CAPTURE_PROMPT;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;
  process.env.PI_SUBAGENT_CAPTURE_PROMPT = capturePath;

  try {
    const result = await runAgentRecord({}, cwd, "scout", "summarize", false, undefined, 0, undefined, undefined, {
      contextMode: "recent",
      parentContext: "Important parent context that should only reach the child prompt",
    });

    assert.equal(result.text, "child summary only");
    assert.equal(result.task, "summarize");
    assert.doesNotMatch(JSON.stringify(result), /Important parent context/);
    assert.match(fs.readFileSync(capturePath, "utf8"), /Important parent context/);
  } finally {
    process.env.PATH = originalPath;
    if (originalCapture === undefined) delete process.env.PI_SUBAGENT_CAPTURE_PROMPT;
    else process.env.PI_SUBAGENT_CAPTURE_PROMPT = originalCapture;
  }
});

test("subagent parent context redacts full secrets before truncating", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-redaction-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const capturePath = path.join(cwd, "captured-prompt.md");
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\ncat > \"$PI_SUBAGENT_CAPTURE_PROMPT\"\nprintf 'redacted summary\\n'\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const originalPath = process.env.PATH;
  const originalCapture = process.env.PI_SUBAGENT_CAPTURE_PROMPT;
  const originalToken = process.env.API_TOKEN;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;
  process.env.PI_SUBAGENT_CAPTURE_PROMPT = capturePath;
  process.env.API_TOKEN = "super-secret-token-12345";

  try {
    await runAgentRecord({}, cwd, "scout", "summarize", false, undefined, 0, undefined, undefined, {
      contextMode: "recent",
      parentContext: "token: super-secret-token-12345",
      parentContextLimit: 18,
    });

    const prompt = fs.readFileSync(capturePath, "utf8");
    assert.doesNotMatch(prompt, /super-secret-token-12345/);
    assert.doesNotMatch(prompt, /token-12345/);
  } finally {
    process.env.PATH = originalPath;
    if (originalCapture === undefined) delete process.env.PI_SUBAGENT_CAPTURE_PROMPT;
    else process.env.PI_SUBAGENT_CAPTURE_PROMPT = originalCapture;
    if (originalToken === undefined) delete process.env.API_TOKEN;
    else process.env.API_TOKEN = originalToken;
  }
});

test("subagent failures preserve redacted stderr diagnostics", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-stderr-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\nprintf 'stdout summary\\n'\nprintf 'stderr diagnostic\\n' >&2\nexit 7\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;

  try {
    const result = await runAgentRecord({}, cwd, "scout", "fail diagnostically", false, undefined, 0);
    assert.equal(result.ok, false);
    assert.equal(result.stderr, "stderr diagnostic");
    assert.match(result.error, /Exited 7/);
    assert.match(result.error, /stderr diagnostic/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("subagent parallel root contextMode applies to tasks by default", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-parallel-context-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const capturePath = path.join(cwd, "captured-prompt.md");
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\ncat > \"$PI_SUBAGENT_CAPTURE_PROMPT\"\nprintf 'parallel summary\\n'\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const originalPath = process.env.PATH;
  const originalCapture = process.env.PI_SUBAGENT_CAPTURE_PROMPT;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;
  process.env.PI_SUBAGENT_CAPTURE_PROMPT = capturePath;

  const ctx = {
    sessionManager: {
      buildSessionContext: () => ({ messages: [{ role: "user", content: "parallel parent context" }] }),
    },
  };

  try {
    await runParallel({}, ctx, cwd, [{ agent: "scout", task: "summarize" }], 1, "recent");

    assert.match(fs.readFileSync(capturePath, "utf8"), /parallel parent context/);
  } finally {
    process.env.PATH = originalPath;
    if (originalCapture === undefined) delete process.env.PI_SUBAGENT_CAPTURE_PROMPT;
    else process.env.PI_SUBAGENT_CAPTURE_PROMPT = originalCapture;
  }
});

test("subagent runner removes temporary prompt files after execution", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-runner-"));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-bin-"));
  const pi = path.join(binDir, "pi");
  fs.writeFileSync(pi, "#!/usr/bin/env bash\ncat >/dev/null\nprintf 'ok\\n'\n", "utf8");
  fs.chmodSync(pi, 0o755);
  const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.includes(`pi-subagent-`) && name.includes(`-${process.pid}-`)));
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ""}`;

  try {
    const result = await runAgentRecord({}, cwd, "scout", "hello", false, undefined, 0);
    assert.equal(result.agent, "scout");
  } finally {
    process.env.PATH = originalPath;
  }

  const after = fs.readdirSync(os.tmpdir()).filter((name) => name.includes(`pi-subagent-`) && name.includes(`-${process.pid}-`));
  assert.deepEqual(
    after.filter((name) => !before.has(name)),
    [],
  );
});

test("subagent output writer writes safe relative paths inside cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));

  const outPath = await writeOutput(cwd, "reports/result-{index}.md", "ok", 1);

  assert.equal(outPath, path.join(cwd, "reports", "result-2.md"));
  assert.equal(fs.readFileSync(outPath, "utf8"), "ok");
});

test("subagent output writer rejects absolute and traversal paths", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = path.join(os.tmpdir(), `pi-subagent-outside-${process.pid}.md`);

  await assert.rejects(() => writeOutput(cwd, outside, "nope", 0), /Output path must be relative/);
  await assert.rejects(() => writeOutput(cwd, "../escape.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.existsSync(outside), false);
  assert.equal(fs.existsSync(path.join(path.dirname(cwd), "escape.md")), false);
});

test("subagent output writer rejects protected secret paths", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));

  await assert.rejects(() => writeOutput(cwd, ".env", "SECRET=value", 0), /Protected output path denied/);
  await assert.rejects(() => writeOutput(cwd, "nested/private-key.txt", "SECRET=value", 0), /Protected output path denied/);

  assert.equal(fs.existsSync(path.join(cwd, ".env")), false);
  assert.equal(fs.existsSync(path.join(cwd, "nested", "private-key.txt")), false);
});

test("subagent output writer rejects symlink escapes inside cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-outside-"));
  fs.symlinkSync(outside, path.join(cwd, "link"), "dir");

  await assert.rejects(() => writeOutput(cwd, "link/escaped.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.existsSync(path.join(outside, "escaped.md")), false);
});

test("subagent output writer rejects existing symlink output files", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-output-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-outside-"));
  const outsideFile = path.join(outside, "target.md");
  fs.writeFileSync(outsideFile, "original", "utf8");
  fs.symlinkSync(outsideFile, path.join(cwd, "out.md"));

  await assert.rejects(() => writeOutput(cwd, "out.md", "nope", 0), /Output path must stay inside cwd/);

  assert.equal(fs.readFileSync(outsideFile, "utf8"), "original");
});
