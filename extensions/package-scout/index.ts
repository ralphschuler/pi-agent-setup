import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export type PackageScoutParams = {
  packages?: string[];
  query?: string;
  limit?: number;
};

export type PackageAudit = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  repository?: string;
  publishedAt?: string;
  modifiedAt?: string;
  ageDays?: number;
  riskStatus: "consider" | "avoid" | "audit needed";
  risks: string[];
};

type NpmPackageMetadata = {
  name?: string;
  description?: string;
  "dist-tags"?: { latest?: string };
  versions?: Record<string, { license?: string; repository?: RepositoryValue; deprecated?: string; description?: string }>;
  repository?: RepositoryValue;
  license?: string;
  time?: Record<string, string>;
};

type RepositoryValue = string | { type?: string; url?: string };

type NpmSearchResponse = {
  objects?: Array<{ package?: { name?: string } }>;
};

export default function packageScout(pi: ExtensionAPI) {
  pi.registerCommand("package-scout", {
    description: "Audit npm package metadata without installing packages",
    handler: async (args, ctx) => {
      const scope = args.trim();
      ctx.ui.notify("Queued package scout audit workflow.", "info");
      pi.sendUserMessage(buildPackageScoutPrompt(scope), { deliverAs: "followUp" });
    },
  });

  pi.registerTool({
    name: "package_scout",
    label: "Package Scout",
    description: "Audit npm package metadata and classify package risk without installing packages.",
    promptSnippet: "Audit npm/Pi package metadata without installing packages.",
    promptGuidelines: [
      "Use package_scout before considering third-party Pi package installation or adoption.",
      "Audit package metadata only; do not install packages.",
      "Report license, repository, publish freshness, and risk status: consider, avoid, or audit needed.",
    ],
    parameters: Type.Object({
      packages: Type.Optional(Type.Array(Type.String(), { description: "Exact npm package names to audit without installing." })),
      query: Type.Optional(Type.String({ description: "Optional npm search query, e.g. pi package." })),
      limit: Type.Optional(
        Type.Number({ description: `Maximum packages to audit from search results (1-${MAX_LIMIT}; default ${DEFAULT_LIMIT}).` }),
      ),
    }),
    async execute(_toolCallId, params: PackageScoutParams, signal) {
      const names = await resolvePackageNames(params, signal);
      if (names.length === 0) throw new Error("package_scout requires packages or query.");

      const audits = await Promise.all(names.map((name) => auditPackageName(name, signal)));
      return {
        content: [{ type: "text", text: formatAuditReport(audits) }],
        details: { packages: audits },
      };
    },
  });
}

function buildPackageScoutPrompt(scope: string) {
  return [
    "Run the /package-scout workflow for npm/Pi package metadata.",
    scope
      ? `User-provided package names or query: ${scope}`
      : "No package names were provided; infer candidate package names or ask via human_in_loop if unclear.",
    "",
    "Goal:",
    "Audit npm package metadata without installing packages and classify each package as consider, avoid, or audit needed.",
    "",
    "Required process:",
    "1. Use package_scout with exact package names or a focused npm search query.",
    "2. Do not install packages or run package install commands.",
    "3. Report name, version, description, license, repository, publish freshness, risk status, and reasons.",
    "4. Use human_in_loop for every user-facing clarification or approval question.",
  ].join("\n");
}

async function resolvePackageNames(params: PackageScoutParams, signal?: AbortSignal) {
  const explicit = (params.packages || []).map((name) => name.trim()).filter(Boolean);
  if (explicit.length) return unique(explicit).slice(0, clampLimit(params.limit));
  if (!params.query?.trim()) return [];

  const url = new URL(NPM_SEARCH_URL);
  url.searchParams.set("text", params.query.trim());
  url.searchParams.set("size", String(clampLimit(params.limit)));

  const response = await fetch(url, { signal, headers: { accept: "application/json", "user-agent": "pi-package-scout/1.0" } });
  if (!response.ok) throw new Error(`npm search failed (${response.status} ${response.statusText})`);
  const payload = (await response.json()) as NpmSearchResponse;
  return unique((payload.objects || []).map((entry) => entry.package?.name || "").filter(Boolean)).slice(0, clampLimit(params.limit));
}

async function auditPackageName(name: string, signal?: AbortSignal) {
  const response = await fetch(`${NPM_REGISTRY_URL}/${encodeURIComponentPackageName(name)}`, {
    signal,
    headers: { accept: "application/json", "user-agent": "pi-package-scout/1.0" },
  });
  if (response.status === 404) return missingPackageAudit(name);
  if (!response.ok) throw new Error(`npm metadata fetch failed for ${name} (${response.status} ${response.statusText})`);
  return auditPackageMetadata((await response.json()) as NpmPackageMetadata, new Date());
}

export function auditPackageMetadata(metadata: NpmPackageMetadata, now = new Date()): PackageAudit {
  const name = metadata.name || "unknown";
  const version =
    metadata["dist-tags"]?.latest ||
    Object.keys(metadata.versions || {})
      .sort()
      .at(-1) ||
    "unknown";
  const latest = metadata.versions?.[version] || {};
  const license = latest.license || metadata.license;
  const repository = normalizeRepository(latest.repository || metadata.repository);
  const publishedAt = metadata.time?.[version];
  const modifiedAt = metadata.time?.modified;
  const ageDays = publishedAt ? daysBetween(new Date(publishedAt), now) : undefined;
  const risks = classifyRisks({ license, repository, publishedAt, ageDays, deprecated: latest.deprecated });

  return {
    name,
    version,
    description: latest.description || metadata.description,
    license,
    repository,
    publishedAt,
    modifiedAt,
    ageDays,
    riskStatus: riskStatusFor(risks),
    risks,
  };
}

function missingPackageAudit(name: string): PackageAudit {
  return {
    name,
    version: "not found",
    riskStatus: "avoid",
    risks: ["package not found in npm registry"],
  };
}

function classifyRisks(input: { license?: string; repository?: string; publishedAt?: string; ageDays?: number; deprecated?: string }) {
  const risks: string[] = [];
  if (input.deprecated) risks.push(`deprecated: ${input.deprecated}`);
  if (!input.license) risks.push("missing license metadata");
  if (!input.repository) risks.push("missing repository metadata");
  if (!input.publishedAt) risks.push("missing publish timestamp");
  if (input.ageDays !== undefined && input.ageDays > 730) risks.push("latest publish is older than 2 years");
  if (input.ageDays !== undefined && input.ageDays > 365 && input.ageDays <= 730) risks.push("latest publish is older than 1 year");
  return risks.length ? risks : ["metadata looks healthy; still inspect source before installing"];
}

function riskStatusFor(risks: string[]): PackageAudit["riskStatus"] {
  if (risks.some((risk) => risk.includes("deprecated") || risk.includes("not found") || risk.includes("older than 2 years")))
    return "avoid";
  if (risks.some((risk) => risk.includes("missing") || risk.includes("older than 1 year"))) return "audit needed";
  return "consider";
}

export function formatAuditReport(audits: PackageAudit[]) {
  const lines = ["# Package Scout Audit", "", "Metadata only. No packages were installed.", ""];
  for (const audit of audits) {
    lines.push(
      `## ${audit.name}`,
      "",
      `- Version: ${audit.version}`,
      `- Description: ${audit.description || "n/a"}`,
      `- License: ${audit.license || "n/a"}`,
      `- Repository: ${audit.repository || "n/a"}`,
      `- Published: ${audit.publishedAt || "n/a"}${audit.ageDays !== undefined ? ` (${audit.ageDays} days old)` : ""}`,
      `- Modified: ${audit.modifiedAt || "n/a"}`,
      `- Risk status: ${audit.riskStatus}`,
      "- Reasons:",
      ...audit.risks.map((risk) => `  - ${risk}`),
      "",
    );
  }
  return lines.join("\n");
}

function normalizeRepository(value: RepositoryValue | undefined) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.url;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value || DEFAULT_LIMIT)));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function encodeURIComponentPackageName(name: string) {
  return encodeURIComponent(name);
}
