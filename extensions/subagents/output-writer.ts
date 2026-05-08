import fs from "node:fs/promises";
import path from "node:path";
import { isProtectedSecretPath, resolveInsideRoot } from "../shared/safety.ts";

export async function writeOutput(cwd: string, output: string | boolean | undefined, text: string, index: number) {
  if (typeof output !== "string" || !output) return undefined;
  const resolved = output.includes("{index}") ? output.replaceAll("{index}", String(index + 1)) : output;
  if (path.isAbsolute(resolved)) throw new Error(`Output path must be relative: ${resolved}`);
  if (isProtectedSecretPath(resolved)) throw new Error(`Protected output path denied: ${resolved}`);

  const outPath = resolveInsideRoot(cwd, resolved);
  if (!outPath) throw new Error(`Output path must stay inside cwd: ${resolved}`);

  await ensureOutputPathInsideRoot(cwd, resolved, outPath);
  await fs.writeFile(outPath, text, "utf8");
  return outPath;
}

async function ensureOutputPathInsideRoot(cwd: string, requestedPath: string, outPath: string) {
  const safeRoot = path.resolve(cwd);
  const realRoot = await fs.realpath(safeRoot);
  const normalized = path.normalize(requestedPath);
  const outputDir = path.dirname(normalized);
  const parts = outputDir === "." ? [] : outputDir.split(path.sep).filter(Boolean);
  let current = safeRoot;

  for (const part of parts) {
    current = path.join(current, part);
    await ensureDirectoryInsideRoot(safeRoot, realRoot, current, requestedPath);
  }

  await rejectExistingSymlinkOutput(safeRoot, realRoot, outPath, requestedPath);
}

async function ensureDirectoryInsideRoot(safeRoot: string, realRoot: string, dirPath: string, requestedPath: string) {
  try {
    const stat = await fs.lstat(dirPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Output path must stay inside cwd: ${requestedPath}`);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await fs.mkdir(dirPath);
  }

  const realDir = await fs.realpath(dirPath);
  if (!isInsideRoot(realRoot, realDir) || !isInsideRoot(safeRoot, dirPath)) {
    throw new Error(`Output path must stay inside cwd: ${requestedPath}`);
  }
}

async function rejectExistingSymlinkOutput(safeRoot: string, realRoot: string, outPath: string, requestedPath: string) {
  try {
    const stat = await fs.lstat(outPath);
    if (stat.isSymbolicLink()) throw new Error(`Output path must stay inside cwd: ${requestedPath}`);
    const realOut = await fs.realpath(outPath);
    if (!isInsideRoot(realRoot, realOut) || !isInsideRoot(safeRoot, outPath)) {
      throw new Error(`Output path must stay inside cwd: ${requestedPath}`);
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

function isInsideRoot(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isNotFoundError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
