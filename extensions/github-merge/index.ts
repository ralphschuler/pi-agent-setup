import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const execFile = promisify(execFileCallback);
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 10_000;

export type GithubRebaseMergeParams = {
  pr?: string | number;
  deleteBranch?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

type CommandRunner = (command: string, args: string[], signal?: AbortSignal) => Promise<{ stdout: string; stderr: string }>;

type CheckRollup = {
  __typename?: string;
  name?: string;
  workflowName?: string;
  status?: string;
  conclusion?: string;
  state?: string;
};

export type PullRequestView = {
  number?: number;
  title?: string;
  url?: string;
  state?: string;
  isDraft?: boolean;
  headRefName?: string;
  baseRefName?: string;
  mergeStateStatus?: string;
  mergeable?: string;
  statusCheckRollup?: CheckRollup[];
};

type MergeResultView = {
  state?: string;
  mergedAt?: string;
  mergeCommit?: { oid?: string };
  url?: string;
};

export default function githubMerge(pi: ExtensionAPI) {
  pi.registerTool({
    name: "github_rebase_merge",
    label: "GitHub Rebase Merge",
    description: "Wait for PR checks and perform a safe GitHub rebase merge on an existing PR.",
    promptSnippet: "Use github_rebase_merge after identifying one existing PR and getting required approval.",
    promptGuidelines: [
      "Use only for an existing PR in the current repository; do not auto-create PRs.",
      "Use human_in_loop before merging when user approval is needed.",
      "Do not merge draft, non-mergeable, failed-check, ambiguous, or timed-out PRs.",
      "The tool waits for checks, runs gh pr merge --rebase, and verifies final merged state.",
    ],
    parameters: Type.Object({
      pr: Type.Optional(
        Type.Union([Type.String(), Type.Number()], { description: "PR number, URL, or branch. Defaults to current branch PR." }),
      ),
      deleteBranch: Type.Optional(Type.Boolean({ description: "Delete branch after merge. Default true." })),
      timeoutMs: Type.Optional(Type.Number({ description: "Maximum milliseconds to wait for checks. Default 30 minutes." })),
      pollIntervalMs: Type.Optional(Type.Number({ description: "Milliseconds between check polls. Default 10000." })),
    }),
    async execute(_toolCallId, params: GithubRebaseMergeParams, signal, onUpdate: unknown) {
      const result = await rebaseMergePullRequest(params, signal, undefined, (progress) => {
        if (typeof onUpdate === "function") onUpdate({ content: [{ type: "text", text: progress }], isPartial: true });
      });
      return {
        content: [{ type: "text", text: formatMergeReport(result) }],
        details: result,
      };
    },
  });
}

export async function rebaseMergePullRequest(
  params: GithubRebaseMergeParams,
  signal?: AbortSignal,
  runner: CommandRunner = runGh,
  onProgress?: (progress: string) => void,
) {
  const timeoutMs = clampNumber(params.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 3_600_000);
  const pollIntervalMs = clampNumber(params.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, 1_000, 60_000);
  const target = normalizeTarget(params.pr);
  const progress: string[] = [];

  let view = await viewPullRequest(target, runner, signal);
  assertMergeReady(view, { allowPendingChecks: true });

  const startedAt = Date.now();
  while (checkState(view.statusCheckRollup).state === "pending") {
    progress.push(formatCheckProgress(view));
    onProgress?.(formatLiveProgress(view));
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out waiting for PR checks after ${timeoutMs}ms.`);
    await delay(pollIntervalMs, signal);
    view = await viewPullRequest(target, runner, signal);
    assertMergeReady(view, { allowPendingChecks: true });
  }

  assertMergeReady(view, { allowPendingChecks: false });

  const mergeArgs = buildMergeArgs(target, params.deleteBranch !== false);
  await runner("gh", mergeArgs, signal);

  const finalView = await viewMergedPullRequest(target, runner, signal);
  if (finalView.state !== "MERGED" || !finalView.mergedAt) throw new Error("PR merge command completed, but final PR state is not merged.");

  return { pr: view, final: finalView, command: ["gh", ...mergeArgs].join(" "), progress };
}

export function buildMergeArgs(target: string | undefined, deleteBranch: boolean) {
  const args = ["pr", "merge"];
  if (target) args.push(target);
  args.push("--rebase");
  if (deleteBranch) args.push("--delete-branch");
  return args;
}

export function assertMergeReady(view: PullRequestView, options: { allowPendingChecks: boolean }) {
  if (!view.number) throw new Error("No pull request found for merge target.");
  if (view.state && view.state !== "OPEN") throw new Error(`PR #${view.number} is not open (${view.state}).`);
  if (view.isDraft) throw new Error(`PR #${view.number} is draft; mark ready before merging.`);
  if (view.mergeable && view.mergeable !== "MERGEABLE") throw new Error(`PR #${view.number} is not mergeable (${view.mergeable}).`);
  if (view.mergeStateStatus && !["CLEAN", "HAS_HOOKS"].includes(view.mergeStateStatus)) {
    throw new Error(`PR #${view.number} merge state is ${view.mergeStateStatus}.`);
  }

  const checks = checkState(view.statusCheckRollup);
  if (checks.state === "failed") throw new Error(`PR #${view.number} has failing checks: ${checks.failed.join(", ")}.`);
  if (checks.state === "pending" && !options.allowPendingChecks) throw new Error(`PR #${view.number} still has pending checks.`);
}

export function checkState(checks: CheckRollup[] = []) {
  const pending: string[] = [];
  const failed: string[] = [];
  for (const check of checks) {
    const label = check.name || check.workflowName || "check";
    const status = (check.status || "").toUpperCase();
    const conclusion = (check.conclusion || "").toUpperCase();
    const state = (check.state || "").toUpperCase();
    if (
      ["FAILURE", "FAILED", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(conclusion) ||
      ["FAILURE", "FAILED", "ERROR"].includes(state)
    ) {
      failed.push(label);
    } else if (["PENDING", "EXPECTED"].includes(state) || (status && status !== "COMPLETED")) {
      pending.push(label);
    } else if (!status && !conclusion && !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(state)) {
      pending.push(label);
    }
  }
  if (failed.length) return { state: "failed" as const, pending, failed };
  if (pending.length) return { state: "pending" as const, pending, failed };
  return { state: "passed" as const, pending, failed };
}

function formatMergeReport(result: Awaited<ReturnType<typeof rebaseMergePullRequest>>) {
  return [
    "# GitHub Rebase Merge",
    "",
    `- PR: ${result.pr.url || `#${result.pr.number}`}`,
    `- Title: ${result.pr.title || "n/a"}`,
    `- Command: ${result.command}`,
    `- Final state: ${result.final.state || "unknown"}`,
    `- Merged at: ${result.final.mergedAt || "n/a"}`,
    `- Merge commit: ${result.final.mergeCommit?.oid || "n/a"}`,
    "",
    "## Check progress",
    "",
    ...(result.progress.length ? result.progress.map((line) => `- ${line}`) : ["- Checks already passed."]),
  ].join("\n");
}

function formatCheckProgress(view: PullRequestView) {
  const checks = checkState(view.statusCheckRollup);
  return `PR #${view.number}: ${checks.pending.length} pending (${checks.pending.join(", ") || "none"})`;
}

function formatLiveProgress(view: PullRequestView) {
  const checks = checkState(view.statusCheckRollup);
  const bars = (view.statusCheckRollup || [])
    .map((check) => {
      const label = check.name || check.workflowName || "check";
      const state = checkState([check]).state;
      const icon = state === "passed" ? "[✓]" : state === "failed" ? "[x]" : "[~]";
      return `${icon} ${label}`;
    })
    .join("\n");
  return [`PR #${view.number} check progress: ${checks.pending.length} pending`, bars].filter(Boolean).join("\n");
}

async function viewPullRequest(target: string | undefined, runner: CommandRunner, signal?: AbortSignal): Promise<PullRequestView> {
  const args = [
    "pr",
    "view",
    ...(target ? [target] : []),
    "--json",
    "number,title,url,state,isDraft,headRefName,baseRefName,mergeStateStatus,mergeable,statusCheckRollup",
  ];
  return JSON.parse((await runner("gh", args, signal)).stdout) as PullRequestView;
}

async function viewMergedPullRequest(target: string | undefined, runner: CommandRunner, signal?: AbortSignal): Promise<MergeResultView> {
  const args = ["pr", "view", ...(target ? [target] : []), "--json", "state,mergedAt,mergeCommit,url"];
  return JSON.parse((await runner("gh", args, signal)).stdout) as MergeResultView;
}

async function runGh(command: string, args: string[], signal?: AbortSignal) {
  try {
    const result = await execFile(command, args, { signal, encoding: "utf8", maxBuffer: 1024 * 1024 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${message}`, { cause: error });
  }
}

function normalizeTarget(value: string | number | undefined) {
  if (value === undefined || value === "") return undefined;
  return String(value);
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value || fallback)));
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted."));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Aborted."));
      },
      { once: true },
    );
  });
}
