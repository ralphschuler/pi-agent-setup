import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { formatRandomFileReport, sampleRandomFiles } from "../../extensions/random-file/index.ts";
import { readText, tempDir } from "../helpers.mjs";

function fixtureRepo() {
  const dir = tempDir("random-file");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n", "utf8");
  fs.writeFileSync(path.join(dir, "src", "b.ts"), "line1\nline2\nline3\n", "utf8");
  fs.writeFileSync(path.join(dir, "docs", "guide.md"), "# Guide\n\nBody\n", "utf8");
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=value\n", "utf8");
  fs.writeFileSync(path.join(dir, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(dir, "large.txt"), "x".repeat(300 * 1024), "utf8");
  return dir;
}

test("random file sampling defaults to five safe text files and returns snippets", () => {
  const root = fixtureRepo();
  const sample = sampleRandomFiles(root, ["src/a.ts", "src/b.ts", "docs/guide.md", ".env", "binary.bin", "large.txt"], {
    seed: "stable",
  });

  assert.equal(sample.seed, "stable");
  assert.deepEqual(sample.files.map((file) => file.path).sort(), ["docs/guide.md", "src/a.ts", "src/b.ts"]);
  assert.ok(sample.files.every((file) => file.sizeBytes > 0));
  assert.ok(sample.files.some((file) => file.snippet.includes("export const a")));
  assert.deepEqual(sample.skippedByReason, {
    binary: 1,
    large: 1,
    protected: 1,
  });
});

test("random file sampling is reproducible with a seed and clamps amount", () => {
  const root = fixtureRepo();
  const candidates = ["src/a.ts", "src/b.ts", "docs/guide.md"];

  const first = sampleRandomFiles(root, candidates, { amount: 500, seed: "abc" });
  const second = sampleRandomFiles(root, candidates, { amount: 500, seed: "abc" });

  assert.deepEqual(first.files, second.files);
  assert.equal(first.amountRequested, 50);
  assert.equal(first.files.length, 3);
});

test("random file sampling supports path and glob filters", () => {
  const root = fixtureRepo();
  const candidates = ["src/a.ts", "src/b.ts", "docs/guide.md"];

  const byPath = sampleRandomFiles(root, candidates, { path: "src", seed: "abc" });
  const byGlob = sampleRandomFiles(root, candidates, { glob: "**/*.md", seed: "abc" });

  assert.deepEqual(byPath.files.map((file) => file.path).sort(), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(
    byGlob.files.map((file) => file.path),
    ["docs/guide.md"],
  );
});

test("random file report includes seed, snippets, and safety summary", () => {
  const root = fixtureRepo();
  const result = sampleRandomFiles(root, ["src/b.ts", ".env"], { seed: "report", snippetLines: 2 });
  const report = formatRandomFileReport(result);

  assert.ok(report.includes("Seed: report"));
  assert.ok(report.includes("src/b.ts"));
  assert.ok(report.includes("line1\nline2"));
  assert.ok(report.includes("Skipped: protected=1"));
});

test("random file tool is documented and agent-visible", () => {
  const source = readText("extensions/random-file/index.ts");
  const readme = readText("README.md");
  const docsIndex = readText("docs/extensions/index.md");
  const docs = readText("docs/extensions/random-file.md");

  assert.ok(source.includes('name: "random_file"'));
  assert.ok(source.includes("promptGuidelines"));
  assert.ok(readme.includes("extensions/random-file/"));
  assert.ok(docsIndex.includes("random_file"));
  assert.ok(docs.includes("optional `seed`"));
});
