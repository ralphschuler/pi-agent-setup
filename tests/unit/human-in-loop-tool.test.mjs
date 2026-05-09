import assert from "node:assert/strict";
import test from "node:test";

import humanInLoop, {
  compactSingleLine,
  formatDialogPrompt,
  MAX_OPTION_CHARS,
  MAX_PROMPT_CHARS,
  MAX_PROMPT_LINES,
} from "../../extensions/human-in-loop/index.ts";

function registerTool() {
  let tool;
  humanInLoop({ registerTool: (definition) => (tool = definition) });
  return tool;
}

test("human_in_loop compacts long prompt context for stable TUI dialogs", () => {
  const prompt = formatDialogPrompt("Question?", Array.from({ length: 120 }, (_, index) => `conversation line ${index + 1}`).join("\n"));

  assert.ok(prompt.split(/\r?\n/).length <= MAX_PROMPT_LINES + 3);
  assert.ok(prompt.length <= MAX_PROMPT_CHARS + 12);
  assert.match(prompt, /truncated/);
  assert.match(prompt, /^Question\?/);
});

test("human_in_loop compacts select options to one bounded line", async () => {
  const tool = registerTool();
  let capturedOptions = [];

  await tool.execute(
    "hil-1",
    {
      mode: "select",
      title: "Pick one",
      options: [
        { label: "A", description: `long\n${"x".repeat(400)}` },
        { label: "B", description: "short" },
      ],
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        select: async (_prompt, options) => {
          capturedOptions = options;
          return options[0];
        },
      },
    },
  );

  assert.equal(capturedOptions.length, 2);
  assert.ok(capturedOptions[0].length <= MAX_OPTION_CHARS);
  assert.equal(capturedOptions[0].includes("\n"), false);
  assert.match(capturedOptions[0], /…$/);
});

test("human_in_loop select enforces documented 2 to 6 option bounds", async () => {
  const tool = registerTool();
  const one = await tool.execute("hil-one", { mode: "select", title: "Pick", options: [{ label: "A" }] }, undefined, undefined, {
    hasUI: true,
    ui: { select: async () => "A" },
  });
  const seven = await tool.execute(
    "hil-seven",
    { mode: "select", title: "Pick", options: Array.from({ length: 7 }, (_, index) => ({ label: `Option ${index + 1}` })) },
    undefined,
    undefined,
    { hasUI: true, ui: { select: async () => "Option 1" } },
  );
  const six = await tool.execute(
    "hil-six",
    { mode: "select", title: "Pick", options: Array.from({ length: 6 }, (_, index) => ({ label: `Option ${index + 1}` })) },
    undefined,
    undefined,
    { hasUI: true, ui: { select: async (_prompt, options) => options[0] } },
  );

  assert.equal(one.isError, true);
  assert.match(one.content[0].text, /2 to 6 options/);
  assert.equal(seven.isError, true);
  assert.match(seven.content[0].text, /2 to 6 options/);
  assert.equal(six.isError, undefined);
});

test("human_in_loop sends compacted prompts to UI primitives", async () => {
  const tool = registerTool();
  const longContext = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n");
  let selectedPrompt = "";
  let confirmTitle = "";
  let confirmMessage = "";
  let inputPrompt = "";
  let editorPrompt = "";

  await tool.execute(
    "hil-2",
    { mode: "select", title: "Question?", context: longContext, options: [{ label: "A" }, { label: "B" }] },
    undefined,
    undefined,
    { hasUI: true, ui: { select: async (prompt, options) => ((selectedPrompt = prompt), options[0]) } },
  );

  await tool.execute("hil-3", { mode: "confirm", title: longContext, context: longContext }, undefined, undefined, {
    hasUI: true,
    ui: { confirm: async (title, message) => ((confirmTitle = title), (confirmMessage = message), true) },
  });

  await tool.execute("hil-4", { mode: "input", title: "Input?", context: longContext }, undefined, undefined, {
    hasUI: true,
    ui: { input: async (prompt) => ((inputPrompt = prompt), "answer") },
  });

  await tool.execute("hil-5", { mode: "editor", title: "Edit?", context: longContext }, undefined, undefined, {
    hasUI: true,
    ui: { editor: async (prompt) => ((editorPrompt = prompt), "answer") },
  });

  assert.ok(selectedPrompt.split(/\r?\n/).length <= MAX_PROMPT_LINES + 3);
  assert.match(selectedPrompt, /truncated/);
  assert.ok(confirmTitle.split(/\r?\n/).length <= 5);
  assert.ok(confirmMessage.split(/\r?\n/).length <= MAX_PROMPT_LINES + 1);
  assert.ok(inputPrompt.split(/\r?\n/).length <= MAX_PROMPT_LINES + 3);
  assert.ok(editorPrompt.split(/\r?\n/).length <= MAX_PROMPT_LINES + 3);
});

test("compactSingleLine preserves short text", () => {
  assert.equal(compactSingleLine("a short label"), "a short label");
});

test("compact prompt context respects the exported character cap including truncation notice", () => {
  const prompt = formatDialogPrompt("Question?", "x".repeat(MAX_PROMPT_CHARS * 2));

  assert.ok(prompt.length <= MAX_PROMPT_CHARS + "Question?\n\n".length);
  assert.match(prompt, /truncated/);
});
