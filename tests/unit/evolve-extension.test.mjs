import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  archiveVariant,
  compareVariant,
  executeEvolve,
  isBinaryBuffer,
  isProtectedEvolvePath,
  readArchive,
  restoreVariant,
  validateEvolvePath,
} from "../../extensions/evolve/index.ts";
import { readText } from "../helpers.mjs";

async function tmpRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-evolve-test-"));
  const archivePath = path.join(dir, ".archive", "archive.json");
  await fs.writeFile(path.join(dir, "example.md"), "one\ntwo\n", "utf8");
  return { dir, archivePath };
}

test("evolve archives, lists, compares, and restores variants", async () => {
  const { dir, archivePath } = await tmpRepo();

  const archived = await archiveVariant({ action: "archive", path: "example.md", label: "baseline" }, dir, archivePath);
  const id = archived.details.variant.id;
  assert.match(archived.content[0].text, /Archived example\.md/);

  await fs.writeFile(path.join(dir, "example.md"), "one\nthree\n", "utf8");
  const compared = await compareVariant({ action: "compare", path: "example.md", id }, dir, archivePath);
  assert.match(compared.content[0].text, /^--- archived:example\.md/m);
  assert.match(compared.content[0].text, /^-two$/m);
  assert.match(compared.content[0].text, /^\+three$/m);

  await assert.rejects(() => restoreVariant({ action: "restore", path: "example.md", id }, dir, archivePath), /human_in_loop approval/);
  await restoreVariant({ action: "restore", path: "example.md", id, approved: true }, dir, archivePath);
  assert.equal(await fs.readFile(path.join(dir, "example.md"), "utf8"), "one\ntwo\n");

  const listed = await executeEvolve({ action: "list" }, dir, archivePath);
  assert.match(listed.content[0].text, /baseline/);

  const archive = await readArchive(archivePath);
  assert.equal(archive.variants.length, 1);
});

test("evolve denies protected, binary, large, and escaping paths", async () => {
  const { dir } = await tmpRepo();
  await fs.writeFile(path.join(dir, ".env"), "TOKEN=secret\n", "utf8");
  await fs.writeFile(path.join(dir, "binary.dat"), Buffer.from([0, 1, 2, 3]));
  await fs.writeFile(path.join(dir, "large.txt"), "x".repeat(300 * 1024), "utf8");

  assert.equal(isProtectedEvolvePath(".env"), true);
  assert.equal(isProtectedEvolvePath("config/private-key.pem"), true);
  assert.equal(isBinaryBuffer(Buffer.from([0, 1, 2, 3])), true);

  await assert.rejects(() => validateEvolvePath(".env", dir), /Protected path denied/);
  await assert.rejects(() => validateEvolvePath("binary.dat", dir), /Binary file denied/);
  await assert.rejects(() => validateEvolvePath("large.txt", dir), /Large file denied/);
  await assert.rejects(() => validateEvolvePath("/etc/passwd", dir), /Path escapes repository|Protected path denied/);
});

test("evolve extension exposes local commands, tool, docs, and no third-party install", () => {
  const source = readText("extensions/evolve/index.ts");
  const docs = readText("docs/extensions/evolve.md");
  const index = readText("docs/extensions/index.md");
  const readme = readText("README.md");
  const mkdocs = readText("mkdocs.yml");
  const pkg = readText("package.json");

  for (const phrase of [
    'pi.registerCommand("evolve"',
    'pi.registerCommand("mutate"',
    'pi.registerCommand("darwin"',
    'name: "evolve"',
    "~/.pi/evolve/archive.json",
    "human_in_loop before calling evolve restore",
  ]) {
    assert.ok(source.includes(phrase), `missing ${phrase}`);
  }

  for (const phrase of ["/evolve", "/mutate", "/darwin", "human_in_loop", "third-party", "Rollback behavior"]) {
    assert.ok(docs.includes(phrase), `docs missing ${phrase}`);
  }

  assert.ok(index.includes("`evolve`"));
  assert.ok(readme.includes("extensions/evolve/"));
  assert.ok(mkdocs.includes("extensions/evolve.md"));
  assert.equal(pkg.includes("@artale/pi-evolve"), false);
});
