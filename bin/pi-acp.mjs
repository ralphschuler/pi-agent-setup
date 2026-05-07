#!/usr/bin/env node
import { fileURLToPath } from "node:url";

export { contentBlocksToImages, contentBlocksToPrompt } from "../lib/acp/content.mjs";
export { createLineReader, parseJsonLines } from "../lib/acp/jsonl.mjs";
export { DEFAULT_PI_COMMAND, PiRpcSession } from "../lib/acp/pi-rpc-session.mjs";
export { PiAcpAdapter, runAcpServer } from "../lib/acp/adapter.mjs";
export {
  ACP_PROTOCOL_VERSION,
  ADAPTER_NAME,
  isDialogUiRequest,
  jsonRpcError,
  jsonRpcResult,
  mapToolKind,
  piEventToAcpNotifications,
  sessionUpdate,
  textFromToolResult,
} from "../lib/acp/protocol.mjs";

import { runAcpServer } from "../lib/acp/adapter.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        "Usage: pi-acp [pi rpc options...]",
        "",
        "Experimental Agent Client Protocol stdio adapter for pi.",
        "Starts `pi --mode rpc` and translates ACP JSON-RPC messages over stdio.",
        "Any arguments are forwarded to the child pi process after `--mode rpc`.",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
  await runAcpServer({ piArgs: args });
}
