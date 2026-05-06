import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { readJson, readText, repoRoot } from "../helpers.mjs";

test("package exposes pi resources and test scripts", () => {
  const pkg = readJson("package.json");

  assert.equal(pkg.type, "module");
  assert.deepEqual(pkg.pi.extensions, ["./extensions"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.deepEqual(pkg.pi.prompts, ["./prompts"]);
  assert.deepEqual(pkg.pi.themes, ["./themes"]);

  for (const script of [
    "check",
    "docs:build",
    "docs:serve",
    "test",
    "test:unit",
    "test:integration",
    "test:e2e",
    "test:coverage",
    "test:ci",
    "test:docker",
  ]) {
    assert.equal(typeof pkg.scripts[script], "string", `missing npm script ${script}`);
  }
});

test("all concrete extension directories have an entrypoint", () => {
  const extensionsDir = path.join(repoRoot, "extensions");
  const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const dir of dirs) {
    if (dir.name === "shared") continue;
    assert.ok(fs.existsSync(path.join(extensionsDir, dir.name, "index.ts")), `${dir.name} missing index.ts`);
  }
});

test("skills have required frontmatter matching directory names", () => {
  const skillsDir = path.join(repoRoot, "skills");
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const dir of skillDirs) {
    const content = readText(path.join("skills", dir.name, "SKILL.md"));
    assert.match(content, new RegExp(`^name:\\s*${dir.name}$`, "m"), `${dir.name} name mismatch`);
    assert.match(content, /^description:\s*\S/m, `${dir.name} missing description`);
  }
});

test("README documents included extension entrypoints", () => {
  const readme = readText("README.md");
  const extensionsDir = path.join(repoRoot, "extensions");
  const names = fs
    .readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "shared")
    .map((entry) => entry.name)
    .sort();

  for (const name of names) {
    assert.match(readme, new RegExp(`extensions/${name}/`), `README missing ${name}`);
  }
});

test("extension docs are reachable from MkDocs nav", () => {
  const mkdocs = readText("mkdocs.yml");
  const docsDir = path.join(repoRoot, "docs", "extensions");
  const pages = fs
    .readdirSync(docsDir)
    .filter((name) => name.endsWith(".md") && name !== "index.md")
    .sort();

  for (const page of pages) {
    assert.match(mkdocs, new RegExp(`extensions/${page.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), `mkdocs nav missing ${page}`);
  }
});

test("resource rules and skill are documented", () => {
  const rules = readText("docs/resource-rules.md");
  const skill = readText("skills/pi-resource-design/SKILL.md");
  const skillsDocs = readText("docs/skills.md");
  const promptsDocs = readText("docs/prompts.md");
  const extensionsDocs = readText("docs/extensions/index.md");
  const mkdocs = readText("mkdocs.yml");

  for (const phrase of [
    "prompt template",
    "skill",
    "extension command",
    "tool",
    "custom subagent",
    "frontmatter",
    "security considerations",
    "validation commands",
    "rollback/stop points",
  ]) {
    assert.ok(rules.includes(phrase), `resource rules missing ${phrase}`);
  }

  assert.match(skill, /^name:\s*pi-resource-design$/m);
  assert.ok(skill.includes("docs/resource-rules.md"));
  assert.ok(skillsDocs.includes("pi-resource-design"));
  assert.ok(promptsDocs.includes("Resource rules"));
  assert.ok(extensionsDocs.includes("Resource rules"));
  assert.ok(mkdocs.includes("resource-rules.md"));
});
