import test from "node:test";

import {
  assertDocsMentionSlashCommand,
  assertPromptMetadata,
  listPromptTemplatePaths,
  parsePromptTemplate,
} from "../prompt-template-helpers.mjs";

const docsPaths = ["docs/prompts.md", "docs/extensions/index.md", "README.md"];

test("prompt templates define shared metadata and argument contracts", () => {
  for (const promptPath of listPromptTemplatePaths()) {
    assertPromptMetadata(parsePromptTemplate(promptPath));
  }
});

test("docs mention prompt-template slash commands", () => {
  for (const promptPath of listPromptTemplatePaths()) {
    assertDocsMentionSlashCommand(promptPath, docsPaths);
  }
});
