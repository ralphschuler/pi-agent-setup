import { StringDecoder } from "node:string_decoder";

export function parseJsonLines(buffer, chunk) {
  const text = buffer + chunk;
  const lines = [];
  let start = 0;
  while (true) {
    const index = text.indexOf("\n", start);
    if (index === -1) break;
    let line = text.slice(start, index);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.trim()) lines.push(line);
    start = index + 1;
  }
  return { lines, rest: text.slice(start) };
}

export function createLineReader(stream, onLine) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    const parsed = parseJsonLines(buffer, decoder.write(chunk));
    buffer = parsed.rest;
    for (const line of parsed.lines) onLine(line);
  });
  stream.on("end", () => {
    const parsed = parseJsonLines(buffer, decoder.end());
    for (const line of parsed.lines) onLine(line);
    buffer = parsed.rest;
  });
}
