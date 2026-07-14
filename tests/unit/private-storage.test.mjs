import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendPrivateFile, atomicWritePrivateFile, withPrivateFileLock } from "../../extensions/shared/private-storage.ts";

test("private storage writes atomic private files and creates private directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-private-storage-"));
  const file = path.join(root, "nested", "state.md");

  await atomicWritePrivateFile(file, "first\n");
  await atomicWritePrivateFile(file, "second\n");

  assert.equal(await fs.readFile(file, "utf8"), "second\n");
  assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test("private storage enforces byte limits before replacement", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-private-storage-limit-"));
  const file = path.join(root, "state.json");
  await atomicWritePrivateFile(file, "safe", { maxBytes: 4 });

  await assert.rejects(() => atomicWritePrivateFile(file, "unsafe", { maxBytes: 4 }), /content exceeds limit/);
  assert.equal(await fs.readFile(file, "utf8"), "safe");
});

test("private storage appends with private file mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-private-storage-append-"));
  const file = path.join(root, "audit.log");

  await appendPrivateFile(file, "one\n");
  await appendPrivateFile(file, "two\n");

  assert.equal(await fs.readFile(file, "utf8"), "one\ntwo\n");
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test("private storage serializes concurrent updates per file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-private-storage-lock-"));
  const file = path.join(root, "state.json");
  const order = [];

  await Promise.all(
    ["one", "two", "three"].map((value) =>
      withPrivateFileLock(file, async () => {
        order.push(`${value}:start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`${value}:end`);
      }),
    ),
  );

  assert.equal(order.length, 6);
  for (let index = 0; index < order.length; index += 2) {
    assert.match(order[index], /:start$/);
    assert.equal(order[index + 1].replace(":end", ""), order[index].replace(":start", ""));
  }
});
