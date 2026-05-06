export function textResult(text: string, details: Record<string, unknown> = {}, isError = false) {
  return { content: [{ type: "text" as const, text }], details, isError };
}

export function textFromResult(result: any) {
  const first = result.content?.[0];
  return first?.type === "text" ? first.text : "";
}
