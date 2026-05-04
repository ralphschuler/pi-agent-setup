import crypto from "node:crypto";

export type ParsedFrames = {
  messages: string[];
  remaining: Buffer;
  close: boolean;
};

export function sendFrame(socket: import("node:net").Socket, payload: unknown) {
  if (socket.destroyed) return;
  const data = Buffer.from(JSON.stringify(payload));
  let header: Buffer;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

export function parseFrames(buffer: Buffer): ParsedFrames {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 8) return { messages, remaining: Buffer.alloc(0), close: true };
    if (opcode === 1) {
      const payloadStart = offset + headerLength + maskLength;
      const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length));
      if (masked) {
        const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      messages.push(payload.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, remaining: buffer.subarray(offset), close: false };
}

export function wsAcceptKey(key: string) {
  return crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}
