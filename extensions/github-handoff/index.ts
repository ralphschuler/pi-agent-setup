import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * GitHub handoff workflows are implemented as prompt templates in `prompts/`:
 *
 * - `/to-issue`  -> `prompts/to-issue.md`
 * - `/to-pr`     -> `prompts/to-pr.md`
 * - `/pick-issue` -> `prompts/pick-issue.md`
 *
 * This extension intentionally does not register duplicate slash commands. Keeping
 * a no-op module preserves package compatibility for users that still list the
 * extension while avoiding command collisions with prompt templates.
 */
export default function githubHandoff(_pi: ExtensionAPI) {
  // No runtime registration. See prompt templates above.
}
