import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { discoverCrossAgentResources } from "./discovery.ts";

export default function crossAgent(pi: ExtensionAPI) {
  pi.on("resources_discover", async (event, ctx) => {
    const resources = await discoverCrossAgentResources(event.cwd || ctx.cwd);
    ctx.ui.setStatus("cross-agent", resources.roots.length ? `cross-agent: ${resources.roots.length}` : "cross-agent: none");
    return {
      promptPaths: resources.promptPaths,
      skillPaths: resources.skillPaths,
    };
  });
}
