import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export const DEFAULT_ARCHIVE_PATH = path.join(homedir(), ".pi", "evolve", "archive.json");
export const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

const protectedPathPatterns = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])\.npmrc$/i,
  /(^|[/\\])\.pypirc$/i,
  /(^|[/\\])credentials(?:\.|$)/i,
  /(^|[/\\])id_rsa$/i,
  /(^|[/\\])id_dsa$/i,
  /(^|[/\\])id_ecdsa$/i,
  /(^|[/\\])id_ed25519$/i,
  /(^|[/\\]).*private[_-]?key.*$/i,
  /(^|[/\\]).*private-key.*$/i,
  /(^|[/\\]).*secret.*$/i,
];

const commandPromptPrefix = [
  "Run the local evolve workflow for the current repository.",
  "Use the evolve tool for archive/status/list/compare/restore metadata and content operations.",
  "Use human_in_loop before every restore/apply/write decision. Do not ask approval questions in plain assistant text.",
  "Do not install @artale/pi-evolve or any third-party evolve package.",
].join("\n");

type EvolveAction = "archive" | "status" | "list" | "compare" | "restore";

type EvolveParams = {
  action: EvolveAction;
  path?: string;
  id?: string;
  content?: string;
  label?: string;
  note?: string;
  approved?: boolean;
};

export type EvolveVariant = {
  id: string;
  path: string;
  label?: string;
  note?: string;
  content: string;
  hash: string;
  bytes: number;
  createdAt: string;
};

export type EvolveArchive = {
  version: 1;
  variants: EvolveVariant[];
};

export default function evolveExtension(pi: ExtensionAPI) {
  pi.registerCommand("evolve", {
    description: "Archive, list, compare, or restore local file variants with safety gates",
    handler: async (args, ctx) => {
      ctx.ui.notify("Queued evolve workflow.", "info");
      pi.sendUserMessage(buildEvolvePrompt(args.trim()), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("mutate", {
    description: "Queue an evolve variant-generation workflow for a target file",
    handler: async (args, ctx) => {
      ctx.ui.notify("Queued mutate workflow.", "info");
      pi.sendUserMessage(buildMutatePrompt(args.trim()), { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("darwin", {
    description: "Queue an evolve iteration workflow for competing file variants",
    handler: async (args, ctx) => {
      ctx.ui.notify("Queued Darwin evolve workflow.", "info");
      pi.sendUserMessage(buildDarwinPrompt(args.trim()), { deliverAs: "followUp" });
    },
  });

  pi.registerTool({
    name: "evolve",
    label: "Evolve",
    description: "Archive, list, compare, and restore local file variants with safety gates. Stores JSON at ~/.pi/evolve/archive.json.",
    promptSnippet: "Archive, list, compare, and restore local file variants with safety gates.",
    promptGuidelines: [
      "Use evolve for local file variant archive/status/list/compare/restore workflows.",
      "Use human_in_loop before calling evolve restore with approved=true or before applying evolved content.",
      "Do not install @artale/pi-evolve or other third-party evolve packages.",
      "Do not archive or restore .env files, credentials, private keys, large files, or binaries.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("archive"),
        Type.Literal("status"),
        Type.Literal("list"),
        Type.Literal("compare"),
        Type.Literal("restore"),
      ]),
      path: Type.Optional(Type.String({ description: "Repository-relative file path for archive/compare/restore target." })),
      id: Type.Optional(Type.String({ description: "Variant id for compare/restore." })),
      content: Type.Optional(Type.String({ description: "Optional variant content to archive instead of reading path." })),
      label: Type.Optional(Type.String({ description: "Optional short variant label." })),
      note: Type.Optional(Type.String({ description: "Optional variant note." })),
      approved: Type.Optional(Type.Boolean({ description: "Set true only after human_in_loop approval for restore writes." })),
    }),
    async execute(_toolCallId, params: EvolveParams, _signal, _onUpdate, ctx) {
      return executeEvolve(params, ctx.cwd);
    },
  });
}

export async function executeEvolve(params: EvolveParams, cwd: string, archivePath = DEFAULT_ARCHIVE_PATH) {
  switch (params.action) {
    case "archive":
      return archiveVariant(params, cwd, archivePath);
    case "status":
      return statusArchive(archivePath);
    case "list":
      return listArchive(archivePath, params.path);
    case "compare":
      return compareVariant(params, cwd, archivePath);
    case "restore":
      return restoreVariant(params, cwd, archivePath);
  }
}

export async function archiveVariant(params: EvolveParams, cwd: string, archivePath = DEFAULT_ARCHIVE_PATH) {
  const safe = await validateEvolvePath(params.path, cwd);
  const content = params.content ?? (await fs.readFile(safe.absolutePath, "utf8"));
  assertSafeContent(content, safe.relativePath);
  const variant: EvolveVariant = {
    id: randomUUID(),
    path: safe.relativePath,
    label: params.label,
    note: params.note,
    content,
    hash: sha256(content),
    bytes: Buffer.byteLength(content),
    createdAt: new Date().toISOString(),
  };
  const archive = await readArchive(archivePath);
  archive.variants.push(variant);
  await writeArchive(archive, archivePath);
  return textResult(`Archived ${variant.path} as ${variant.id}.`, { action: "archive", archivePath, variant: withoutContent(variant) });
}

export async function statusArchive(archivePath = DEFAULT_ARCHIVE_PATH) {
  const archive = await readArchive(archivePath);
  const paths = new Set(archive.variants.map((variant) => variant.path));
  return textResult(`Evolve archive: ${archive.variants.length} variant(s), ${paths.size} file(s).\nStorage: ${archivePath}`, {
    action: "status",
    archivePath,
    variants: archive.variants.length,
    files: paths.size,
  });
}

export async function listArchive(archivePath = DEFAULT_ARCHIVE_PATH, pathFilter?: string) {
  const archive = await readArchive(archivePath);
  const variants = pathFilter ? archive.variants.filter((variant) => variant.path === normalizeRelativePath(pathFilter)) : archive.variants;
  const lines = variants.map((variant) =>
    [`${variant.id} ${variant.path}`, variant.label ? `[${variant.label}]` : undefined, `${variant.bytes} bytes`, variant.createdAt]
      .filter(Boolean)
      .join(" — "),
  );
  return textResult(lines.length ? lines.join("\n") : "No evolve variants found.", {
    action: "list",
    archivePath,
    variants: variants.map(withoutContent),
  });
}

export async function compareVariant(params: EvolveParams, cwd: string, archivePath = DEFAULT_ARCHIVE_PATH) {
  if (!params.id) throw new Error("evolve compare requires id.");
  const archive = await readArchive(archivePath);
  const variant = findVariant(archive, params.id);
  const targetPath = params.path || variant.path;
  const safe = await validateEvolvePath(targetPath, cwd);
  const current = await fs.readFile(safe.absolutePath, "utf8");
  assertSafeContent(current, safe.relativePath);
  const diff = simpleDiff(variant.content, current, variant.path, safe.relativePath);
  return textResult(diff || "No differences.", {
    action: "compare",
    archivePath,
    variant: withoutContent(variant),
    path: safe.relativePath,
  });
}

export async function restoreVariant(params: EvolveParams, cwd: string, archivePath = DEFAULT_ARCHIVE_PATH) {
  if (!params.id) throw new Error("evolve restore requires id.");
  if (!params.approved) throw new Error("evolve restore requires approved=true after human_in_loop approval.");
  const archive = await readArchive(archivePath);
  const variant = findVariant(archive, params.id);
  const targetPath = params.path || variant.path;
  const safe = await validateEvolvePath(targetPath, cwd);
  assertSafeContent(variant.content, safe.relativePath);
  await fs.writeFile(safe.absolutePath, variant.content, "utf8");
  return textResult(`Restored ${variant.id} to ${safe.relativePath}.`, {
    action: "restore",
    archivePath,
    variant: withoutContent(variant),
    path: safe.relativePath,
  });
}

export async function readArchive(archivePath = DEFAULT_ARCHIVE_PATH): Promise<EvolveArchive> {
  try {
    const text = await fs.readFile(archivePath, "utf8");
    const parsed = JSON.parse(text) as EvolveArchive;
    if (parsed.version !== 1 || !Array.isArray(parsed.variants)) throw new Error("invalid evolve archive shape");
    return parsed;
  } catch (error: any) {
    if (error?.code === "ENOENT") return { version: 1, variants: [] };
    throw error;
  }
}

export async function writeArchive(archive: EvolveArchive, archivePath = DEFAULT_ARCHIVE_PATH) {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
}

export async function validateEvolvePath(inputPath: string | undefined, cwd: string) {
  if (!inputPath?.trim()) throw new Error("evolve action requires path.");
  const relativePath = normalizeRelativePath(inputPath);
  if (isProtectedEvolvePath(relativePath)) throw new Error(`Protected path denied: ${relativePath}`);
  const root = path.resolve(cwd);
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) && absolutePath !== root) throw new Error(`Path escapes repository: ${relativePath}`);
  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch (error: any) {
    if (error?.code === "ENOENT") return { absolutePath, relativePath, exists: false };
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Evolve path must be a file: ${relativePath}`);
  if (stat.size > DEFAULT_MAX_FILE_BYTES) throw new Error(`Large file denied: ${relativePath} (${stat.size} bytes)`);
  const buffer = await fs.readFile(absolutePath);
  if (isBinaryBuffer(buffer)) throw new Error(`Binary file denied: ${relativePath}`);
  return { absolutePath, relativePath, exists: true };
}

export function normalizeRelativePath(inputPath: string) {
  let normalized = inputPath.trim().replace(/^@/, "").replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

export function isProtectedEvolvePath(inputPath: string) {
  const normalized = normalizeRelativePath(inputPath);
  return protectedPathPatterns.some((pattern) => pattern.test(normalized));
}

export function isBinaryBuffer(buffer: Buffer) {
  if (buffer.includes(0)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length > 0.1;
}

function assertSafeContent(content: string, relativePath: string) {
  const bytes = Buffer.byteLength(content);
  if (bytes > DEFAULT_MAX_FILE_BYTES) throw new Error(`Large content denied: ${relativePath} (${bytes} bytes)`);
  if (isBinaryBuffer(Buffer.from(content))) throw new Error(`Binary content denied: ${relativePath}`);
}

function findVariant(archive: EvolveArchive, id: string) {
  const variant = archive.variants.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`No evolve variant with id ${id}.`);
  return variant;
}

function withoutContent(variant: EvolveVariant) {
  const { content: _content, ...rest } = variant;
  return rest;
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function simpleDiff(archived: string, current: string, fromPath: string, toPath: string) {
  if (archived === current) return "";
  const before = archived.split(/\r?\n/);
  const after = current.split(/\r?\n/);
  const lines = [`--- archived:${fromPath}`, `+++ current:${toPath}`];
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    if (before[i] === after[i]) continue;
    if (before[i] !== undefined) lines.push(`-${before[i]}`);
    if (after[i] !== undefined) lines.push(`+${after[i]}`);
    if (lines.length > 120) {
      lines.push("… diff truncated; use file tools for full context");
      break;
    }
  }
  return lines.join("\n");
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function buildEvolvePrompt(args: string) {
  return [
    commandPromptPrefix,
    "",
    `User evolve request: ${args || "show archive status/list and ask via human_in_loop if target/action is unclear"}`,
    "",
    "Required process:",
    "1. Use evolve status/list/archive/compare/restore as appropriate.",
    "2. Before restore/apply/write, use human_in_loop to confirm exact file, variant id, and risk.",
    "3. Preserve rollback context by archiving current file content before restore when safe.",
    "4. Report archive id, file path, validation, and rollback notes.",
  ].join("\n");
}

function buildMutatePrompt(args: string) {
  return [
    commandPromptPrefix,
    "",
    `User mutate request: ${args || "missing; ask for target path and desired mutation via human_in_loop"}`,
    "",
    "Required process:",
    "1. Identify target file and desired safe mutation.",
    "2. Use evolve archive to preserve the current file first.",
    "3. Draft a variant in the session and ask via human_in_loop before applying writes.",
    "4. If approved, apply with edit/write, archive the resulting variant, and report compare/rollback info.",
  ].join("\n");
}

function buildDarwinPrompt(args: string) {
  return [
    commandPromptPrefix,
    "",
    `User Darwin request: ${args || "missing; ask for target path, generation count, and fitness goal via human_in_loop"}`,
    "",
    "Required process:",
    "1. Keep generations small and bounded; ask via human_in_loop if count or fitness goal is unclear.",
    "2. Archive the starting file and each candidate variant with evolve archive.",
    "3. Compare candidates against the current file and stated fitness criteria.",
    "4. Before applying a winning variant, use human_in_loop approval and preserve rollback context.",
  ].join("\n");
}
