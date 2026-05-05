import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_SEARXNG_URL = "http://localhost:8080";
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

  pi.registerCommand("research", {
    description: "Research a topic using web search and produce a sourced synthesis",
    handler: async (args, ctx) => {
      const topic = args.trim();
      if (!topic) {
        ctx.ui.notify("Usage: /research <topic or question>", "warning");
        return;
      }

      pi.sendUserMessage(
        [
          {
            type: "text",
            text: [
              `Research this topic using the search tool: ${topic}`,
              "",
              "Process:",
              "1. Run several focused web searches with the search tool.",
              "2. Compare sources and prefer primary/reputable references.",
              "3. Provide a concise synthesis with citations as URLs.",
              "4. Call out uncertainty, conflicting claims, and what was not found.",
            ].join("\n"),
          },
        ],
        { deliverAs: "followUp" },
      );
    },
  });
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
