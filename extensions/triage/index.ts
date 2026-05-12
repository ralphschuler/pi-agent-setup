import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

export type GitHubLabel = { name: string; description?: string; color?: string };
export type TriageIssue = {
  number: number;
  title: string;
  url?: string;
  body?: string;
  state?: string;
  updatedAt?: string;
  author?: { login?: string };
  labels?: GitHubLabel[];
  comments?: Array<{ author?: { login?: string }; body?: string; createdAt?: string }>;
};

const ISSUE_LIMIT = 200;
const ISSUE_LIST_COMMAND = "gh issue list";
const ISSUE_VIEW_COMMAND = "gh issue view";
const LABEL_LIST_COMMAND = "gh label list";

export default function triageExtension(pi: ExtensionAPI) {
  pi.registerCommand("triage", {
    description: "Pick an unlabeled/question GitHub issue and start a label-triage /plan",
    handler: async (_args, ctx) => {
      try {
        await runTriage(pi, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Triage failed: ${message}`, "error");
      }
    },
  });
}

async function runTriage(pi: ExtensionAPI, ctx: any) {
  if (!ctx.hasUI) {
    ctx.ui.notify("/triage requires the interactive TUI so the user can select an issue.", "warning");
    return;
  }

  const issues = await ghJson<TriageIssue[]>(pi, ctx.cwd, "gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    String(ISSUE_LIMIT),
    "--json",
    "number,title,url,labels,updatedAt",
  ]);
  const candidates = filterTriageCandidates(issues);

  if (candidates.length === 0) {
    ctx.ui.notify("No label-triage candidates found (open issues with no labels or the question label).", "info");
    return;
  }

  const selectedNumber = await showIssuePicker(ctx, candidates);
  if (!selectedNumber) {
    ctx.ui.notify("Triage cancelled.", "info");
    return;
  }

  const issue = await ghJson<TriageIssue>(pi, ctx.cwd, "gh", [
    "issue",
    "view",
    String(selectedNumber),
    "--json",
    "number,title,url,body,labels,comments,state,author,createdAt,updatedAt",
  ]);
  const labels = await ghJson<GitHubLabel[]>(pi, ctx.cwd, "gh", ["label", "list", "--limit", "100", "--json", "name,description,color"]);

  pi.events.emit("plan:start", { task: buildTriagePlanTask(issue, labels) });
  ctx.ui.notify(`Queued label-triage /plan for issue #${selectedNumber}.`, "info");
}

async function ghJson<T>(pi: ExtensionAPI, cwd: string, command: string, args: string[]): Promise<T> {
  const result = await pi.exec(command, args, { cwd, timeout: 15_000 });
  if (result.code !== 0) {
    const commandText = `${command} ${args.join(" ")}`;
    const details = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
    throw new Error(`${commandText} failed: ${details}`);
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    const commandText = `${command} ${args.join(" ")}`;
    throw new Error(`${commandText} returned invalid JSON`, { cause: error });
  }
}

export function filterTriageCandidates<T extends { labels?: Array<{ name?: string }> }>(issues: T[]) {
  return issues.filter((issue) => labelNames(issue).length === 0 || hasQuestionLabel(issue));
}

export function formatIssueSelectItem(issue: TriageIssue): SelectItem {
  return {
    value: String(issue.number),
    label: `#${issue.number} ${issue.title}`,
    description: triageReason(issue),
  };
}

async function showIssuePicker(ctx: any, issues: TriageIssue[]): Promise<number | null> {
  const items = issues.map(formatIssueSelectItem);
  const selected = (await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (value: string | null) => void) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Select issue for label triage")), 1, 0));

    const selectList = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
      description: (text: string) => theme.fg("muted", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      noMatch: (text: string) => theme.fg("warning", text),
    });
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  })) as string | null;

  return selected ? Number(selected) : null;
}

export function buildTriagePlanTask(issue: TriageIssue, labels: GitHubLabel[]) {
  return `Label triage only for GitHub issue #${issue.number}: ${issue.title}

Issue URL: ${issue.url || `(run gh issue view ${issue.number})`}
State: ${issue.state || "open"}
Author: ${issue.author?.login || "unknown"}
Current labels: ${formatLabelNames(issue.labels)}
Candidate reason: ${triageReason(issue)}

Issue body:
${indentBlock(truncate(issue.body || "(no body)", 4_000))}

Existing repository labels available for triage:
${formatAvailableLabels(labels)}

Goal:
Create a reviewed plan that decides the correct labels for this issue. Focus on whether to add/remove labels such as bug, documentation, enhancement, good first issue, help wanted, question, architecture, refactor, security, invalid, duplicate, or wontfix based only on the issue content and existing repo label meanings.

Rules:
- Label triage only: no branch, no PR, no implementation.
- Use only existing labels from the repository label list above.
- Do not create or delete labels.
- Do not close the issue, edit the title/body, comment, assign, milestone, or change issue state.
- If a useful label is missing, list it as a follow-up instead of creating it.
- Decide explicitly whether the question label should remain or be removed.
- After the plan is approved, apply exact label changes only with commands like:
  - gh issue edit ${issue.number} --add-label "<existing-label>"
  - gh issue edit ${issue.number} --remove-label "<existing-label>"

Plan output requirements:
- Include current labels, recommended final labels, labels to add, labels to remove, rationale, validation command, and rollback command.
- Keep the plan scoped to issue #${issue.number}.
- When ready, use the normal /plan READY FOR REVIEW gate before any label mutation.`;
}

function labelNames(issue: { labels?: Array<{ name?: string }> }) {
  return (issue.labels || []).map((label) => label.name || "").filter(Boolean);
}

function hasQuestionLabel(issue: { labels?: Array<{ name?: string }> }) {
  return labelNames(issue).some((name) => name.toLowerCase() === "question");
}

function triageReason(issue: { labels?: Array<{ name?: string }> }) {
  if (labelNames(issue).length === 0) return "no labels";
  if (hasQuestionLabel(issue)) return "question label";
  return "already labeled";
}

function formatLabelNames(labels: GitHubLabel[] = []) {
  return labels.length ? labels.map((label) => label.name).join(", ") : "(none)";
}

function formatAvailableLabels(labels: GitHubLabel[]) {
  if (labels.length === 0) return "- (no labels returned by gh label list)";
  return labels.map((label) => `- ${label.name}${label.description ? ` — ${label.description}` : ""}`).join("\n");
}

function indentBlock(text: string) {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function truncate(text: string, maxChars: number) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()}\n… [truncated for label-triage planning]`;
}

void ISSUE_LIST_COMMAND;
void ISSUE_VIEW_COMMAND;
void LABEL_LIST_COMMAND;
