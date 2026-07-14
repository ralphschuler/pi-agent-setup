import assert from "node:assert/strict";
import test from "node:test";

import { assertMergeReady, buildMergeArgs, checkState, rebaseMergePullRequest } from "../../extensions/github-merge/index.ts";
import { readText } from "../helpers.mjs";

test("github merge tool builds rebase merge args", () => {
  assert.deepEqual(buildMergeArgs("42", true), ["pr", "merge", "42", "--rebase", "--delete-branch"]);
  assert.deepEqual(buildMergeArgs(undefined, false), ["pr", "merge", "--rebase"]);
});

test("github merge tool classifies check rollup", () => {
  assert.equal(checkState([{ name: "ci", status: "IN_PROGRESS" }]).state, "pending");
  assert.equal(checkState([{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }]).state, "passed");
  assert.equal(checkState([{ name: "ci", status: "COMPLETED", conclusion: "FAILURE" }]).state, "failed");
  assert.equal(checkState([{ name: "legacy", state: "PENDING" }]).state, "pending");
  assert.equal(checkState([{ name: "legacy", state: "SUCCESS" }]).state, "passed");
  assert.equal(checkState([{ name: "legacy", state: "FAILURE" }]).state, "failed");
  assert.equal(checkState(undefined).state, "indeterminate");
  assert.equal(checkState([]).state, "indeterminate");
});

test("github merge tool blocks unsafe PR states", () => {
  assert.throws(() => assertMergeReady({ number: 1, isDraft: true }, { allowPendingChecks: true }), /draft/);
  assert.throws(() => assertMergeReady({ number: 1, state: "CLOSED" }, { allowPendingChecks: true }), /not open/);
  assert.throws(() => assertMergeReady({ number: 1, mergeable: "CONFLICTING" }, { allowPendingChecks: true }), /not mergeable/);
  assert.throws(() => assertMergeReady({ number: 1, statusCheckRollup: [] }, { allowPendingChecks: true }), /missing or empty/);
  assert.throws(() => assertMergeReady({ number: 1 }, { allowPendingChecks: true }), /missing or empty/);
  assert.throws(
    () =>
      assertMergeReady(
        { number: 1, statusCheckRollup: [{ name: "ci", status: "COMPLETED", conclusion: "FAILURE" }] },
        { allowPendingChecks: true },
      ),
    /failing checks/,
  );
  assert.doesNotThrow(() =>
    assertMergeReady(
      { number: 1, mergeStateStatus: "UNSTABLE", statusCheckRollup: [{ name: "ci", status: "IN_PROGRESS" }] },
      { allowPendingChecks: true },
    ),
  );
  assert.throws(
    () =>
      assertMergeReady(
        { number: 1, mergeStateStatus: "UNSTABLE", statusCheckRollup: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }] },
        { allowPendingChecks: false },
      ),
    /merge state is UNSTABLE/,
  );
});

test("github merge tool waits for checks, merges, and verifies", async () => {
  const calls = [];
  const runner = async (command, args) => {
    calls.push([command, args]);
    if (args[0] === "pr" && args[1] === "view" && args.some((arg) => arg.includes("number,title,url"))) {
      const pending =
        calls.filter((call) => call[1][0] === "pr" && call[1][1] === "view" && call[1].some((arg) => arg.includes("number,title,url")))
          .length === 1;
      return {
        stdout: JSON.stringify({
          number: 40,
          title: "Merge me",
          url: "https://example.invalid/pull/40",
          state: "OPEN",
          isDraft: false,
          mergeStateStatus: "CLEAN",
          mergeable: "MERGEABLE",
          statusCheckRollup: pending
            ? [{ name: "ci", status: "IN_PROGRESS", conclusion: "" }]
            : [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
        }),
        stderr: "",
      };
    }
    if (args[0] === "pr" && args[1] === "merge") return { stdout: "", stderr: "" };
    if (args[0] === "pr" && args[1] === "view" && args.includes("state,mergedAt,mergeCommit,url")) {
      return { stdout: JSON.stringify({ state: "MERGED", mergedAt: "2026-05-05T00:00:00Z", mergeCommit: { oid: "abc" } }), stderr: "" };
    }
    throw new Error(`unexpected call ${command} ${args.join(" ")}`);
  };

  const liveProgress = [];
  const result = await rebaseMergePullRequest({ pr: 40, pollIntervalMs: 1, timeoutMs: 1000 }, undefined, runner, (progress) =>
    liveProgress.push(progress),
  );

  assert.equal(result.final.state, "MERGED");
  assert.ok(liveProgress.some((progress) => progress.includes("[~] ci")));
  assert.ok(calls.some(([, args]) => args.join(" ") === "pr merge 40 --rebase --delete-branch"));
});

test("github merge extension exposes tool and not duplicate slash command", () => {
  const source = readText("extensions/github-merge/index.ts");

  assert.ok(source.includes('name: "github_rebase_merge"'));
  assert.ok(source.includes("gh pr merge --rebase"));
  assert.ok(source.includes("onUpdate"));
  assert.equal(source.includes("registerCommand"), false);
});
