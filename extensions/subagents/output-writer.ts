import fs from "node:fs/promises";
import path from "node:path";

export async function writeOutput(cwd: string, output: string | boolean | undefined, text: string, index: number) {
  if (typeof output !== "string" || !output) return undefined;
  const resolved = output.includes("{index}") ? output.replaceAll("{index}", String(index + 1)) : output;
  const outPath = path.resolve(cwd, resolved);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  return outPath;
}
