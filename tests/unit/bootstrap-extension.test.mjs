import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { issueTemplateFiles, runBootstrap } from "../../extensions/bootstrap/index.ts";
import { readText, tempDir } from "../helpers.mjs";

test("bootstrap command creates pi-ready context and ADR starter files", () => {
  const source = readText("extensions/bootstrap/index.ts");

  assert.match(source, /pi\.registerCommand\("bootstrap"/);
  assert.match(source, /CONTEXT\.md/);
  assert.match(source, /docs\/adr\/README\.md/);
  assert.match(source, /docs\/adr\/0001-record-architecture-decisions\.md/);
  assert.match(source, /Agent guidance/);
  assert.match(source, /Architecture decision records/);
  assert.match(source, /Status: Accepted/);
  assert.match(source, /git.+rev-parse.+--show-toplevel/s);
  assert.match(source, /--dry-run/);
  assert.match(source, /--force/);
  assert.match(source, /ctx\.ui\.notify/);
  assert.match(source, /ISSUE_TEMPLATE/);
  assert.match(source, /blank_issues_enabled: true/);
  assert.match(source, /bug_report\.yml/);
  assert.match(source, /security_hardening\.yml/);
  assert.match(source, /architecture_refactor\.yml/);
  assert.match(source, /hasGitHubRemote/);
});

test("bootstrap issue template catalog keeps blank issues enabled and uses existing labels", () => {
  const files = issueTemplateFiles();
  const byPath = new Map(files.map((file) => [file.filePath, file.content]));

  assert.equal(byPath.get(".github/ISSUE_TEMPLATE/config.yml")?.includes("blank_issues_enabled: true"), true);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/bug_report.yml"), /labels:\s*\["bug"\]/);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/feature_request.yml"), /labels:\s*\["enhancement"\]/);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/documentation.yml"), /labels:\s*\["documentation"\]/);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/security_hardening.yml"), /labels:\s*\["security"\]/);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/architecture_refactor.yml"), /labels:\s*\["architecture", "refactor"\]/);
  assert.match(byPath.get(".github/ISSUE_TEMPLATE/question.yml"), /labels:\s*\["question"\]/);
});

test("bootstrap creates issue templates for GitHub repos but skips non-GitHub repos", () => {
  const nonGithub = tempGitRepo("bootstrap-non-github");
  const nonGithubResult = runBootstrap("", fakeCtx(nonGithub));
  assert.match(nonGithubResult, /Skipped \.github\/ISSUE_TEMPLATE\/ \(no GitHub remote or existing \.github directory\)/);
  assert.equal(fs.existsSync(path.join(nonGithub, ".github", "ISSUE_TEMPLATE")), false);

  const githubRepo = tempGitRepo("bootstrap-github");
  execFileSync("git", ["-C", githubRepo, "remote", "add", "origin", "git@github.com:example/repo.git"]);
  const githubResult = runBootstrap("", fakeCtx(githubRepo));
  assert.match(githubResult, /Created \.github\/ISSUE_TEMPLATE\/bug_report\.yml/);
  assert.equal(fs.existsSync(path.join(githubRepo, ".github", "ISSUE_TEMPLATE", "question.yml")), true);
});

function tempGitRepo(prefix) {
  const dir = tempDir(prefix);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function fakeCtx(cwd) {
  return { cwd, ui: { notify() {} } };
}
