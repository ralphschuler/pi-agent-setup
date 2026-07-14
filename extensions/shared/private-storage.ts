import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { chmodSync, closeSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

const fileLocks = new Map<string, Promise<void>>();

export async function ensurePrivateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await chmod(directory, PRIVATE_DIRECTORY_MODE);
}

export function ensurePrivateDirectorySync(directory: string) {
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  chmodSync(directory, PRIVATE_DIRECTORY_MODE);
}

export function atomicWritePrivateFileSync(file: string, content: string, options: { maxBytes?: number; mode?: number } = {}) {
  assertTextLimit(content, options.maxBytes);
  const directory = path.dirname(file);
  ensurePrivateDirectorySync(directory);
  const mode = options.mode ?? PRIVATE_FILE_MODE;
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temporary, "wx", mode);
    writeFileSync(fd, content, "utf8");
    chmodSync(temporary, mode);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, file);
    chmodSync(file, mode);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

export async function atomicWritePrivateFile(file: string, content: string, options: { maxBytes?: number; mode?: number } = {}) {
  await atomicReplaceFile(file, content, { ...options, privateDirectory: true, mode: options.mode ?? PRIVATE_FILE_MODE });
}

export async function atomicReplaceFile(
  file: string,
  content: string,
  options: { maxBytes?: number; mode?: number; privateDirectory?: boolean } = {},
) {
  assertTextLimit(content, options.maxBytes);
  const directory = path.dirname(file);
  if (options.privateDirectory) await ensurePrivateDirectory(directory);
  else await mkdir(directory, { recursive: true });

  const existingMode = options.mode === undefined ? await existingFileMode(file) : undefined;
  const mode = options.mode ?? existingMode ?? 0o644;
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(content, "utf8");
    await handle.chmod(mode);
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    await chmod(file, mode);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function appendPrivateFile(file: string, content: string, options: { maxBytes?: number } = {}) {
  assertTextLimit(content, options.maxBytes);
  await ensurePrivateDirectory(path.dirname(file));
  const handle = await open(file, "a", PRIVATE_FILE_MODE);
  try {
    await handle.writeFile(content, "utf8");
    await handle.chmod(PRIVATE_FILE_MODE);
  } finally {
    await handle.close();
  }
}

export async function readPrivateFile(file: string) {
  return readFile(file, "utf8");
}

async function existingFileMode(file: string) {
  try {
    return (await stat(file)).mode & 0o777;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function withPrivateFileLock<T>(file: string, callback: () => Promise<T> | T): Promise<T> {
  const key = path.resolve(file);
  const previous = fileLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  fileLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (fileLocks.get(key) === current) fileLocks.delete(key);
  }
}

export function assertTextLimit(content: string, maxBytes = 0) {
  if (!maxBytes || Buffer.byteLength(content, "utf8") <= maxBytes) return;
  throw new Error(`Private storage content exceeds limit (${maxBytes} bytes).`);
}

export async function privateFileMode(file: string) {
  return (await stat(file)).mode & 0o777;
}
