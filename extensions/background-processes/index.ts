import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function backgroundProcesses(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n<background_processes>\n${instructions()}\n</background_processes>`,
    };
  });
}

function instructions() {
  return [
    "Background process support is available through this package's custom process tool.",
    "Use process for long-running commands instead of shell background patterns like &, nohup, disown, or setsid.",
    "Good fits: dev servers, test watchers, build watchers, local APIs, log tails, and preview servers.",
    "Workflow:",
    "1. Start a process with a stable descriptive name.",
    "2. Set alertOnFailure=true for important processes and alertOnSuccess=true for finite builds/tests where completion matters.",
    "3. Continue with other work instead of polling. For finite tasks where you need to pause, call wait once, then inspect process output/list once.",
    "4. Inspect output/logs only when needed or when an alert indicates attention is required.",
    "5. Kill processes that are no longer needed and clear finished processes when appropriate.",
    "Use log watches when a specific output pattern should trigger attention, such as server ready URLs, compile errors, or test failures.",
    "If a process expects input, use process write rather than trying to pipe through a background shell command.",
  ].join("\n");
}
