import assert from "node:assert/strict";
import test from "node:test";

import { customAgentTemplates, findTemplate, formatTemplateCatalog, templateNames } from "../../extensions/custom-agents/templates.ts";
import { readText } from "../helpers.mjs";

const expectedTemplates = ["security-reviewer", "docs-maintainer", "release-manager", "browser-qa", "dependency-auditor"];

test("custom-agent templates include expected reusable agents", () => {
  assert.deepEqual(templateNames(), expectedTemplates);

  for (const template of customAgentTemplates) {
    assert.equal(template.package, "custom");
    assert.equal(template.defaultContext, "fresh");
    assert.equal(template.inheritProjectContext, true);
    assert.equal(template.inheritSkills, true);
    assert.equal(template.systemPromptMode, "replace");
    assert.ok(template.description.length > 20, `${template.templateName} description`);

    for (const phrase of ["Role:", "Scope:", "Success criteria:", "Escalation rules:", "Output contract:"]) {
      assert.ok(template.systemPrompt.includes(phrase), `${template.templateName} missing ${phrase}`);
    }
  }
});

test("custom-agent template lookup and catalog formatting work", () => {
  assert.equal(findTemplate("security-reviewer")?.name, "security-reviewer");
  assert.equal(findTemplate("missing"), undefined);

  const catalog = formatTemplateCatalog();
  for (const name of expectedTemplates) assert.ok(catalog.includes(name), `catalog missing ${name}`);
});

test("/agent workflow exposes template listing and installation", () => {
  const source = readText("extensions/custom-agents/index.ts");

  assert.ok(source.includes("/agent templates"));
  assert.ok(source.includes("/agent install-template <name> [user|project]"));
  assert.ok(source.includes('command === "templates"'));
  assert.ok(source.includes('command === "install-template"'));
  assert.ok(source.includes("findTemplate(templateName)"));
});

test("custom-agent template docs mention each template", () => {
  const docs = readText("docs/extensions/custom-agents.md");

  assert.ok(docs.includes("/agent templates"));
  assert.ok(docs.includes("/agent install-template"));
  for (const name of expectedTemplates) assert.ok(docs.includes(name), `docs missing ${name}`);
});
