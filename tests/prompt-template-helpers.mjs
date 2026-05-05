import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readText, repoRoot } from "./helpers.mjs";

const frontmatterPattern = /^---\n(?<frontmatter>[\s\S]*?)\n---\n(?<content>[\s\S]*)$/;

export function parsePromptTemplate(relativePath) {
  const text = readText(relativePath);
  const match = text.match(frontmatterPattern);

  assert.ok(match, `${relativePath} must start with YAML frontmatter delimited by ---`);

  return {
    relativePath,
    text,
    frontmatter: parseSimpleFrontmatter(match.groups.frontmatter, relativePath),
    content: match.groups.content,
  };
}

export function listPromptTemplatePaths() {
  return fs
    .readdirSync(path.join(repoRoot, "prompts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.posix.join("prompts", entry.name))
    .sort();
}

export function assertPromptMetadata(prompt, options = {}) {
  assertNonEmptyString(prompt.frontmatter.description, `${prompt.relativePath} frontmatter.description`);

  if (options.requiresArguments !== false) {
    assertNonEmptyString(prompt.frontmatter["argument-hint"], `${prompt.relativePath} frontmatter.argument-hint`);
    assert.ok(prompt.content.includes("$ARGUMENTS"), `${prompt.relativePath} must include $ARGUMENTS`);
  }
}

export function assertDocsMentionSlashCommand(promptPath, docsPaths) {
  const command = `/${path.basename(promptPath, ".md")}`;

  for (const docsPath of docsPaths) {
    assert.ok(readText(docsPath).includes(command), `${docsPath} must mention ${command}`);
  }
}

function parseSimpleFrontmatter(frontmatter, relativePath) {
  const result = {};

  for (const [index, rawLine] of frontmatter.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    assert.notEqual(separatorIndex, -1, `${relativePath} frontmatter line ${index + 1} must be key: value`);

    const key = line.slice(0, separatorIndex).trim();
    const value = unquote(line.slice(separatorIndex + 1).trim());

    assert.ok(key, `${relativePath} frontmatter line ${index + 1} must have a key`);
    assert.notEqual(value, "", `${relativePath} frontmatter.${key} must not be empty`);
    result[key] = value;
  }

  return result;
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
