import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export default function bootstrap(pi: ExtensionAPI) {
  pi.registerCommand("bootstrap", {
    description: "Create pi-ready repository context files (CONTEXT.md, docs/adr, and GitHub issue templates)",
    handler: async (args, ctx) => {
      runBootstrap(args || "", ctx);
    },
  });
}

type BootstrapOptions = { target: string; force: boolean; dryRun: boolean };
type TemplateFile = { filePath: string; content: string };

function parseArgs(args: string, cwd: string): BootstrapOptions {
  const opts = { target: cwd, force: false, dryRun: false };
  const tokens = shellWords(args);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "--force") opts.force = true;
    else if (token === "--dry-run") opts.dryRun = true;
    else if (token === "--path") {
      const value = tokens[++i];
      if (!value) throw new Error("--path requires a value");
      opts.target = value;
    } else if (token.startsWith("--path=")) opts.target = token.slice("--path=".length);
    else if (!token.startsWith("-") && opts.target === cwd) opts.target = token;
    else throw new Error(`Unknown /bootstrap option: ${token}`);
  }
  opts.target = path.resolve(cwd, opts.target);
  return opts;
}

export function runBootstrap(args: string, ctx: any) {
  const cwd = ctx.cwd || process.cwd();
  const opts = parseArgs(args, cwd);
  const root = gitRoot(opts.target);
  if (!root) throw new Error(`${opts.target} is not inside a Git repository. Run git init first.`);

  const includeIssueTemplates = shouldBootstrapIssueTemplates(root);
  const lines = [`${opts.dryRun ? "Planning" : "Bootstrapping"} pi repository context in ${root}`];
  for (const file of templates(today(), includeIssueTemplates)) lines.push(writeStarter(root, file, opts));
  if (!includeIssueTemplates) lines.push("Skipped .github/ISSUE_TEMPLATE/ (no GitHub remote or existing .github directory)");
  lines.push("Done. Next: fill TODOs, then ask pi to inspect CONTEXT.md and docs/adr/ before planning.");
  const text = lines.join("\n");
  ctx.ui.notify(text, "info");
  return text;
}

function gitRoot(cwd: string) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function shouldBootstrapIssueTemplates(repoRoot: string) {
  return fs.existsSync(path.join(repoRoot, ".github")) || hasGitHubRemote(repoRoot);
}

export function hasGitHubRemote(repoRoot: string) {
  try {
    const output = execFileSync("git", ["-C", repoRoot, "remote", "-v"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /github\.com[:/]/.test(output);
  } catch {
    return false;
  }
}

function templates(date: string, includeIssueTemplates = false): TemplateFile[] {
  return [...contextTemplates(date), ...(includeIssueTemplates ? issueTemplateFiles() : [])];
}

function contextTemplates(date: string): TemplateFile[] {
  return [
    {
      filePath: "CONTEXT.md",
      content: `# Project context\n\nKeep this file durable and concise. Pi agents should read it before non-trivial planning or implementation.\n\n## Mission\n\nTODO: What problem does this repository solve, and for whom?\n\n## Current priorities\n\n- TODO: Active product or engineering priority.\n- TODO: Important constraints, deadlines, or compatibility targets.\n\n## Domain vocabulary\n\n| Term | Meaning |\n| --- | --- |\n| TODO | TODO |\n\n## Architecture map\n\n- TODO: Main runtime entrypoint/module.\n- TODO: Important data stores, external systems, or boundaries.\n- TODO: Test strategy and fastest validation commands.\n\n## Agent guidance\n\n- Inspect this file and \`docs/adr/\` before changing architecture or terminology.\n- Prefer behavior-first tests through public interfaces.\n- Record durable architecture decisions as ADRs in \`docs/adr/\`.\n- Keep generated plans, PRDs, and issue bodies aligned with this context.\n`,
    },
    {
      filePath: "docs/adr/README.md",
      content: `# Architecture decision records\n\nADRs capture durable decisions that future maintainers and pi agents must respect.\n\n## When to add an ADR\n\nAdd or update an ADR when a change affects:\n\n- architecture, module boundaries, or public APIs\n- data storage, migrations, or external integrations\n- security, privacy, deployment, or operational assumptions\n- terminology that should remain stable across issues, PRDs, and plans\n\n## Format\n\nUse sequential filenames such as \`0002-use-postgres-for-events.md\`. Keep each record short:\n\n1. Title\n2. Date\n3. Status: Proposed, Accepted, Superseded, or Rejected\n4. Context\n5. Decision\n6. Consequences\n`,
    },
    {
      filePath: "docs/adr/0001-record-architecture-decisions.md",
      content: `# 0001. Record architecture decisions\n\nDate: ${date}\n\nStatus: Accepted\n\n## Context\n\nFuture maintainers and pi agents need a stable place to find project-level decisions before planning or implementation.\n\n## Decision\n\nWe will record durable architecture decisions in \`docs/adr/\` and keep project vocabulary plus agent guidance in \`CONTEXT.md\`.\n\n## Consequences\n\n- Agents should inspect \`CONTEXT.md\` and relevant ADRs before non-trivial work.\n- New durable architecture choices should add or update ADRs.\n- Short-lived implementation notes should stay in issues, PRs, or plans instead of ADRs.\n`,
    },
  ];
}

export function issueTemplateFiles(): TemplateFile[] {
  return [
    {
      filePath: ".github/ISSUE_TEMPLATE/config.yml",
      content: `blank_issues_enabled: true\ncontact_links: []\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/bug_report.yml",
      content: `name: Bug report\ndescription: Report something that is not working.\ntitle: "Bug: "\nlabels: ["bug"]\nbody:\n  - type: markdown\n    attributes:\n      value: |\n        Thanks for reporting a bug. Include only public, non-secret details.\n  - type: textarea\n    id: summary\n    attributes:\n      label: Summary\n      description: What happened?\n      placeholder: Describe the broken behavior.\n    validations:\n      required: true\n  - type: textarea\n    id: expected\n    attributes:\n      label: Expected behavior\n      description: What should have happened?\n    validations:\n      required: true\n  - type: textarea\n    id: reproduce\n    attributes:\n      label: Reproduction steps\n      description: List the smallest steps, commands, or inputs that reproduce the bug.\n      placeholder: |\n        1. ...\n        2. ...\n        3. ...\n    validations:\n      required: true\n  - type: textarea\n    id: validation\n    attributes:\n      label: Validation or logs\n      description: Paste relevant public logs, screenshots, or command output. Do not include secrets.\n    validations:\n      required: false\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/feature_request.yml",
      content: `name: Feature request\ndescription: Propose a new capability or enhancement.\ntitle: "Feature: "\nlabels: ["enhancement"]\nbody:\n  - type: textarea\n    id: problem\n    attributes:\n      label: Problem\n      description: What user problem should this solve?\n    validations:\n      required: true\n  - type: textarea\n    id: solution\n    attributes:\n      label: Proposed solution\n      description: What should change?\n    validations:\n      required: true\n  - type: textarea\n    id: acceptance\n    attributes:\n      label: Acceptance criteria\n      description: What observable behavior proves this is done?\n      placeholder: |\n        - [ ] ...\n        - [ ] ...\n    validations:\n      required: false\n  - type: textarea\n    id: context\n    attributes:\n      label: Context\n      description: Links, examples, constraints, or alternatives.\n    validations:\n      required: false\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/documentation.yml",
      content: `name: Documentation\ndescription: Request or improve documentation.\ntitle: "Docs: "\nlabels: ["documentation"]\nbody:\n  - type: textarea\n    id: gap\n    attributes:\n      label: Documentation gap\n      description: What is missing, wrong, or unclear?\n    validations:\n      required: true\n  - type: textarea\n    id: audience\n    attributes:\n      label: Audience\n      description: Who needs this information?\n    validations:\n      required: false\n  - type: textarea\n    id: suggested\n    attributes:\n      label: Suggested change\n      description: What should the docs say or link to?\n    validations:\n      required: false\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/security_hardening.yml",
      content: `name: Security / hardening\ndescription: Request defensive security, privacy, or safety work.\ntitle: "Security: "\nlabels: ["security"]\nbody:\n  - type: markdown\n    attributes:\n      value: |\n        Do not post secrets, exploit payloads, private tokens, or vulnerability details that should be disclosed privately.\n  - type: textarea\n    id: risk\n    attributes:\n      label: Risk or hardening need\n      description: What risk should be reduced?\n    validations:\n      required: true\n  - type: textarea\n    id: scope\n    attributes:\n      label: Scope\n      description: Affected files, systems, data, or workflows.\n    validations:\n      required: false\n  - type: textarea\n    id: acceptance\n    attributes:\n      label: Acceptance criteria\n      description: What confirms the risk is mitigated?\n    validations:\n      required: false\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/architecture_refactor.yml",
      content: `name: Architecture / refactor\ndescription: Propose architecture, module-boundary, or behavior-preserving refactor work.\ntitle: "Refactor: "\nlabels: ["architecture", "refactor"]\nbody:\n  - type: textarea\n    id: problem\n    attributes:\n      label: Design problem\n      description: What is hard to change, test, reason about, or maintain?\n    validations:\n      required: true\n  - type: textarea\n    id: proposal\n    attributes:\n      label: Proposed direction\n      description: What boundary, module, interface, or refactor should be considered?\n    validations:\n      required: false\n  - type: textarea\n    id: validation\n    attributes:\n      label: Validation\n      description: What tests or checks should prove behavior stayed correct?\n    validations:\n      required: false\n`,
    },
    {
      filePath: ".github/ISSUE_TEMPLATE/question.yml",
      content: `name: Question\ndescription: Ask for clarification before work is actionable.\ntitle: "Question: "\nlabels: ["question"]\nbody:\n  - type: textarea\n    id: question\n    attributes:\n      label: Question\n      description: What needs clarification?\n    validations:\n      required: true\n  - type: textarea\n    id: context\n    attributes:\n      label: Context\n      description: What led to this question?\n    validations:\n      required: false\n  - type: textarea\n    id: decision\n    attributes:\n      label: Decision needed\n      description: What decision would make this actionable?\n    validations:\n      required: false\n`,
    },
  ];
}

function writeStarter(repoRoot: string, file: TemplateFile, opts: { force: boolean; dryRun: boolean }) {
  const target = path.join(repoRoot, file.filePath);
  const exists = fs.existsSync(target);
  if (opts.dryRun) return `${exists && !opts.force ? "Would skip" : exists ? "Would overwrite" : "Would create"} ${file.filePath}`;
  if (exists && !opts.force) return `Skipped ${file.filePath} (exists; use --force to overwrite)`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.content, "utf8");
  return `${exists ? "Overwrote" : "Created"} ${file.filePath}`;
}

function shellWords(input: string) {
  const words: string[] = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = "";
    } else current += ch;
  }
  if (quote) throw new Error("Unclosed quote in /bootstrap arguments");
  if (current) words.push(current);
  return words;
}
