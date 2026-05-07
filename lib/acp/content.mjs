export function contentBlocksToPrompt(blocks) {
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    if (block.type === "resource_link" && typeof block.uri === "string") parts.push(`Context resource: ${block.uri}`);
    if (block.type === "resource" && typeof block.resource?.text === "string") parts.push(block.resource.text);
  }
  return parts.join("\n\n").trim();
}

export function contentBlocksToImages(blocks) {
  if (!Array.isArray(blocks)) return [];
  const images = [];
  for (const block of blocks) {
    if (block?.type !== "image") continue;
    if (typeof block.data === "string" && typeof block.mimeType === "string") {
      images.push({ type: "image", data: block.data, mimeType: block.mimeType });
    }
  }
  return images;
}
