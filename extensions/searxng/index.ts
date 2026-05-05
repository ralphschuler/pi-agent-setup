import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export const DEFAULT_SEARXNG_URL = "http://localhost:8080";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 50;

type SearchParams = {
  query: string;
  maxResults?: number;
  categories?: string[];
  engines?: string[];
  language?: string;
  timeRange?: "day" | "week" | "month" | "year";
  safesearch?: 0 | 1 | 2;
};

type SearxngResult = {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  engines?: string[];
  category?: string;
  score?: number;
  publishedDate?: string;
  pretty_url?: string;
};

type SearxngResponse = {
  query?: string;
  number_of_results?: number;
  results?: SearxngResult[];
  answers?: string[];
  suggestions?: string[];
  infoboxes?: unknown[];
  unresponsive_engines?: Array<[string, string]>;
};

export default function searxngExtension(pi: ExtensionAPI) {
  pi.registerCommand("searxng", {
    description: "Show SearXNG backend status and setup help",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Queued SearXNG status/setup check.", "info");
      pi.sendUserMessage(buildSearxngStatusPrompt(), { deliverAs: "followUp" });
    },
  });

  pi.registerTool({
    name: "searxng_status",
    label: "SearXNG Status",
    description: "Check SearXNG backend health and show setup/remediation instructions.",
    promptSnippet: "Check SearXNG backend health and setup instructions.",
    promptGuidelines: [
      "Use searxng_status when SearXNG search fails or setup status is requested.",
      "Report the active backend URL and whether it came from SEARXNG_URL or the default.",
      "If unreachable, show Docker and SEARXNG_URL remediation steps.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      const health = await checkSearxngHealth(process.env.SEARXNG_URL, signal);
      return {
        content: [{ type: "text", text: formatSearxngStatus(health) }],
        details: health,
      };
    },
  });

  pi.registerTool({
    name: "search",
    label: "Search",
    description: "Search the web through a SearXNG instance and return normalized results with URLs, snippets, and metadata.",
    promptSnippet: "Search the web via SearXNG for current information, sources, and citations.",
    promptGuidelines: [
      "Use search when the user asks for current facts, external references, source discovery, or web research.",
      "Prefer focused queries and cite result URLs when using search findings in an answer.",
      "If search fails because no SearXNG instance is reachable, tell the user to set SEARXNG_URL or run SearXNG locally.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      maxResults: Type.Optional(
        Type.Number({ description: `Maximum results to return (1-${MAX_RESULTS_LIMIT}; default ${DEFAULT_MAX_RESULTS})` }),
      ),
      categories: Type.Optional(Type.Array(Type.String(), { description: "Optional SearXNG categories, e.g. general, news, science, it" })),
      engines: Type.Optional(Type.Array(Type.String(), { description: "Optional SearXNG engines to use" })),
      language: Type.Optional(Type.String({ description: "Optional language code, e.g. en, en-US, de" })),
      timeRange: Type.Optional(
        Type.Union([Type.Literal("day"), Type.Literal("week"), Type.Literal("month"), Type.Literal("year")], {
          description: "Optional freshness filter",
        }),
      ),
      safesearch: Type.Optional(
        Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)], { description: "0=off, 1=moderate, 2=strict" }),
      ),
    }),
    async execute(_toolCallId, params: SearchParams, signal) {
      const baseUrl = normalizeBaseUrl(process.env.SEARXNG_URL || DEFAULT_SEARXNG_URL);
      const maxResults = clampMaxResults(params.maxResults);
      const url = buildSearchUrl(baseUrl, params);

      let response: Response;
      try {
        response = await fetch(url, {
          signal,
          headers: {
            accept: "application/json",
            "user-agent": "pi-searxng-search/1.0",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to reach SearXNG at ${baseUrl}: ${message}. Set SEARXNG_URL to your SearXNG instance.`, { cause: error });
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`SearXNG search failed (${response.status} ${response.statusText}) at ${baseUrl}: ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as SearxngResponse;
      const results = (payload.results || []).slice(0, maxResults).map((result, index) => ({
        rank: index + 1,
        title: result.title || "Untitled",
        url: result.url || "",
        snippet: stripHtml(result.content || ""),
        engine: result.engine || result.engines?.join(", "),
        category: result.category,
        score: result.score,
        publishedDate: result.publishedDate,
        prettyUrl: result.pretty_url,
      }));

      const text = formatResults(params.query, baseUrl, results, payload);
      return {
        content: [{ type: "text", text }],
        details: {
          query: params.query,
          searxngUrl: baseUrl,
          resultCount: results.length,
          results,
          answers: payload.answers || [],
          suggestions: payload.suggestions || [],
          unresponsiveEngines: payload.unresponsive_engines || [],
        },
      };
    },
  });
}

export type SearxngHealth = {
  baseUrl: string;
  source: "SEARXNG_URL" | "default";
  ok: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  remediation: string[];
};

function buildSearxngStatusPrompt() {
  return [
    "Run the SearXNG status/setup workflow for this session.",
    "",
    "Goal:",
    "Report the active SearXNG backend URL, detect whether it is reachable, and show remediation steps if needed.",
    "",
    "Required process:",
    "1. Call searxng_status.",
    "2. Report whether the backend URL comes from SEARXNG_URL or the default.",
    "3. If unreachable, show Docker startup and SEARXNG_URL export instructions.",
    "4. Use human_in_loop for every user-facing clarification or approval question.",
  ].join("\n");
}

export async function checkSearxngHealth(envUrl = process.env.SEARXNG_URL, signal?: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const baseUrl = normalizeBaseUrl(envUrl || DEFAULT_SEARXNG_URL);
  const source: SearxngHealth["source"] = envUrl?.trim() ? "SEARXNG_URL" : "default";
  const remediation = searxngRemediation(baseUrl);

  try {
    const response = await fetchImpl(buildHealthUrl(baseUrl), {
      signal,
      headers: { accept: "application/json", "user-agent": "pi-searxng-status/1.0" },
    });
    return {
      baseUrl,
      source,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      error: response.ok ? undefined : `SearXNG returned ${response.status} ${response.statusText}`,
      remediation: response.ok ? [] : remediation,
    } satisfies SearxngHealth;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { baseUrl, source, ok: false, error: message, remediation } satisfies SearxngHealth;
  }
}

export function formatSearxngStatus(health: SearxngHealth) {
  const lines = [
    "# SearXNG Status",
    "",
    `- Backend URL: ${health.baseUrl}`,
    `- Source: ${health.source}`,
    `- Status: ${health.ok ? "reachable" : "unreachable"}`,
  ];
  if (health.status) lines.push(`- HTTP: ${health.status} ${health.statusText || ""}`.trim());
  if (health.error) lines.push(`- Error: ${health.error}`);
  if (!health.ok) lines.push("", "## Remediation", "", ...health.remediation.map((step) => `- ${step}`));
  return lines.join("\n");
}

function searxngRemediation(baseUrl: string) {
  return [
    `Start a local SearXNG instance, for example: docker run --rm -p 8080:8080 searxng/searxng`,
    `Or point pi at an existing instance: export SEARXNG_URL=${baseUrl === DEFAULT_SEARXNG_URL ? "https://your-searxng.example" : baseUrl}`,
    "Then retry /searxng or the search tool.",
  ];
}

function buildHealthUrl(baseUrl: string) {
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", "pi searxng health check");
  url.searchParams.set("format", "json");
  return url;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function buildSearchUrl(baseUrl: string, params: SearchParams) {
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  if (params.categories?.length) url.searchParams.set("categories", params.categories.join(","));
  if (params.engines?.length) url.searchParams.set("engines", params.engines.join(","));
  if (params.language) url.searchParams.set("language", params.language);
  if (params.timeRange) url.searchParams.set("time_range", params.timeRange);
  if (params.safesearch !== undefined) url.searchParams.set("safesearch", String(params.safesearch));
  return url;
}

function clampMaxResults(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
  return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.floor(value || DEFAULT_MAX_RESULTS)));
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatResults(query: string, baseUrl: string, results: Array<Record<string, unknown>>, payload: SearxngResponse) {
  const lines = [`SearXNG results for: ${query}`, `Instance: ${baseUrl}`];
  if (payload.answers?.length) lines.push("", "Answers:", ...payload.answers.map((answer) => `- ${answer}`));
  if (results.length === 0) lines.push("", "No results returned.");
  else {
    lines.push("", "Results:");
    for (const result of results) {
      lines.push(
        `${result.rank}. ${result.title}`,
        `   URL: ${result.url}`,
        result.snippet ? `   Snippet: ${result.snippet}` : undefined,
        result.engine ? `   Engine: ${result.engine}` : undefined,
        result.publishedDate ? `   Published: ${result.publishedDate}` : undefined,
      );
    }
  }
  if (payload.suggestions?.length) lines.push("", `Suggestions: ${payload.suggestions.join(", ")}`);
  if (payload.unresponsive_engines?.length) {
    lines.push("", `Unresponsive engines: ${payload.unresponsive_engines.map(([engine, reason]) => `${engine} (${reason})`).join(", ")}`);
  }
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0).join("\n");
}
