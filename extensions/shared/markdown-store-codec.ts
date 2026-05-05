export function encodeStoredBlock(value: string) {
  return ["```base64", Buffer.from(value, "utf8").toString("base64"), "```"].join("\n");
}

export function decodeStoredBlock(value: string) {
  const match = value.match(/^```base64\n([A-Za-z0-9+/=\s]*)\n```$/);
  if (!match) return value;

  try {
    return Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8").trim();
  } catch {
    return value;
  }
}

export function normalizeSingleLine(value: string | undefined, options: { collapseWhitespace?: boolean } = {}) {
  let normalized = (value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

  if (options.collapseWhitespace) normalized = normalized.replace(/\s+/g, " ");
  return normalized;
}
