import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { DEFAULT_SAFE_TEXT_FILE_MAX_BYTES, isBinaryBuffer, isProtectedSecretPath, resolveExistingInsideRoot } from "../shared/safety.ts";

const DEFAULT_AMOUNT = 5;
const MAX_AMOUNT = 50;
const DEFAULT_SNIPPET_LINES = 20;
const MAX_SNIPPET_LINES = 80;
const SNIPPET_MAX_BYTES = 8 * 1024;

export type RandomFileParams = {
  amount?: number;
  seed?: string;
  path?: string;
  glob?: string;
  snippetLines?: number;
};

export type RandomFileResult = {
  seed: string;
  amountRequested: number;
  candidateCount: number;
  files: Array<{ path: string; sizeBytes: number; snippet: string }>;
  skippedByReason: Record<string, number>;
};

export default function randomFile(pi: ExtensionAPI) {
  pi.registerTool({
    name: "random_file",
    label: "Random File",
    description: "Sample unbiased Git-tracked safe text files from the current repository and return bounded snippets.",
    promptSnippet: "Randomly sample Git-tracked safe text files with snippets for unbiased repo exploration.",
    promptGuidelines: [
      "Use random_file when broad review, refine-codebase, or discovery work would benefit from unbiased file sampling instead of search terms.",
      "Use random_file with a small amount first; pass seed to reproduce or extend a previous sample.",
      "After random_file returns candidate paths and snippets, use read for any file that needs full inspection.",
    ],
    parameters: Type.Object({
      amount: Type.Optional(Type.Number({ description: `Number of files to sample. Default ${DEFAULT_AMOUNT}, max ${MAX_AMOUNT}.` })),
      seed: Type.Optional(Type.String({ description: "Optional seed for reproducible sampling. Returned in the result." })),
      path: Type.Optional(Type.String({ description: "Optional repository-relative directory or path prefix to sample within." })),
      glob: Type.Optional(Type.String({ description: "Optional simple glob filter, e.g. **/*.ts or docs/**/*.md." })),
      snippetLines: Type.Optional(
        Type.Number({ description: `Snippet lines per file. Default ${DEFAULT_SNIPPET_LINES}, max ${MAX_SNIPPET_LINES}.` }),
      ),
    }),
    async execute(_toolCallId, params: RandomFileParams, _signal, _onUpdate, ctx) {
      const repoRoot = gitRoot(ctx.cwd || process.cwd());
      if (!repoRoot) throw new Error("random_file requires a Git repository.");
      const trackedFiles = gitTrackedFiles(repoRoot);
      const result = sampleRandomFiles(repoRoot, trackedFiles, params);
      return {
        content: [{ type: "text", text: formatRandomFileReport(result) }],
        details: result,
      };
    },
  });
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

function gitTrackedFiles(repoRoot: string) {
  const output = execFileSync("git", ["-C", repoRoot, "ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return output.split(/\r?\n/).filter(Boolean);
}

export function sampleRandomFiles(repoRoot: string, candidatePaths: string[], params: RandomFileParams = {}): RandomFileResult {
  const seed = params.seed?.trim() || crypto.randomUUID();
  const amount = clampInt(params.amount, DEFAULT_AMOUNT, 1, MAX_AMOUNT);
  const snippetLines = clampInt(params.snippetLines, DEFAULT_SNIPPET_LINES, 1, MAX_SNIPPET_LINES);
  const skippedByReason: Record<string, number> = {};
  const files = [] as Array<{ path: string; sizeBytes: number; snippet: string }>;

  for (const relativePath of candidatePaths.map(normalizeCandidatePath).filter(Boolean)) {
    if (!matchesScope(relativePath, params)) continue;
    const inspected = inspectCandidate(repoRoot, relativePath, snippetLines);
    if (inspected.skipped) {
      skippedByReason[inspected.skipped] = (skippedByReason[inspected.skipped] || 0) + 1;
      continue;
    }
    files.push(inspected.file);
  }

  files.sort((a, b) => seededRank(seed, a.path).localeCompare(seededRank(seed, b.path)) || a.path.localeCompare(b.path));

  return {
    seed,
    amountRequested: amount,
    candidateCount: files.length,
    files: files.slice(0, amount),
    skippedByReason,
  };
}

function inspectCandidate(repoRoot: string, relativePath: string, snippetLines: number) {
  if (isProtectedSecretPath(relativePath)) return { skipped: "protected" as const, file: undefined as never };
  const absolutePath = resolveExistingInsideRoot(repoRoot, relativePath);
  if (!absolutePath) return { skipped: "outside-root" as const, file: undefined as never };

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return { skipped: "missing" as const, file: undefined as never };
  }
  if (!stat.isFile()) return { skipped: "not-file" as const, file: undefined as never };
  if (stat.size > DEFAULT_SAFE_TEXT_FILE_MAX_BYTES) return { skipped: "large" as const, file: undefined as never };

  const buffer = fs.readFileSync(absolutePath);
  if (isBinaryBuffer(buffer)) return { skipped: "binary" as const, file: undefined as never };
  const text = buffer.toString("utf8");
  return {
    skipped: undefined,
    file: {
      path: relativePath,
      sizeBytes: stat.size,
      snippet: makeSnippet(text, snippetLines),
    },
  };
}

function makeSnippet(text: string, snippetLines: number) {
  const lines = text.split(/\r?\n/).slice(0, snippetLines).join("\n");
  if (Buffer.byteLength(lines) <= SNIPPET_MAX_BYTES) return lines;
  return `${Buffer.from(lines).subarray(0, SNIPPET_MAX_BYTES).toString("utf8")}\n[snippet truncated]`;
}

function matchesScope(relativePath: string, params: RandomFileParams) {
  const normalizedPath = normalizeCandidatePath(relativePath);
  if (params.path?.trim()) {
    const prefix = normalizeCandidatePath(params.path);
    if (normalizedPath !== prefix && !normalizedPath.startsWith(`${prefix}/`)) return false;
  }
  if (params.glob?.trim() && !globToRegExp(params.glob.trim()).test(normalizedPath)) return false;
  return true;
}

function normalizeCandidatePath(input: string) {
  return String(input || "")
    .trim()
    .replace(/^@/, "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function globToRegExp(glob: string) {
  let pattern = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === "*" && next === "*") {
      pattern += ".*";
      i += 1;
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += escapeRegExp(char);
  }
  return new RegExp(`${pattern}$`);
}

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function seededRank(seed: string, relativePath: string) {
  return crypto.createHash("sha256").update(seed).update("\0").update(relativePath).digest("hex");
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(Number(value))));
}

export function formatRandomFileReport(result: RandomFileResult) {
  const lines = [
    "Random file sample",
    `Seed: ${result.seed}`,
    `Files: ${result.files.length}/${result.candidateCount} safe candidates`,
    `Requested amount: ${result.amountRequested}`,
  ];
  const skipped = Object.entries(result.skippedByReason)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => `${reason}=${count}`)
    .join(", ");
  if (skipped) lines.push(`Skipped: ${skipped}`);
  for (const file of result.files) {
    lines.push("", `## ${file.path} (${file.sizeBytes} bytes)`, "```", file.snippet, "```");
  }
  if (result.files.length === 0) lines.push("", "No matching safe text files found.");
  return lines.join("\n");
}
