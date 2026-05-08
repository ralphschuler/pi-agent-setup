let planModeActive = false;

export function setSubagentPlanModeActive(active: boolean) {
  planModeActive = active;
}

export function isSubagentPlanModeActive() {
  return planModeActive;
}

export const READ_ONLY_SUBAGENT_TOOLS = "read,grep,find,ls";

export const READ_ONLY_SUBAGENT_INSTRUCTIONS = [
  "Plan-mode read-only constraints:",
  "- Use only read-only investigation tools.",
  "- Do not edit, write, delete, move, or create files.",
  "- Do not implement code changes, commit, push, install packages, start servers, or mutate git state.",
  "- Output findings, evidence, risks, and validation suggestions only.",
].join("\n");
