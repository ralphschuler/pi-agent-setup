import assert from "node:assert/strict";
import test from "node:test";

import { parseFrames, sendFrame, wsAcceptKey } from "../../extensions/shared/websocket.ts";

test("websocket sendFrame writes JSON text frames and accept keys", () => {
  const writes = [];
  sendFrame({ destroyed: false, write: (chunk) => writes.push(chunk) }, { hello: "world" });

  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 0x81);
  assert.equal(writes[0].subarray(2).toString("utf8"), '{"hello":"world"}');
  assert.equal(wsAcceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("websocket parser handles complete text and close frames", () => {
  const text = Buffer.from([0x81, 0x02, 0x68, 0x69]);
  assert.deepEqual(parseFrames(text).messages, ["hi"]);
  assert.equal(parseFrames(Buffer.from([0x88, 0])).close, true);
});

test("websocket parser rejects oversized buffers and frames", () => {
  assert.deepEqual(parseFrames(Buffer.alloc(11), { maxBufferBytes: 10 }).close, true);

  const huge = Buffer.alloc(10);
  huge[0] = 0x81;
  huge[1] = 127;
  huge.writeBigUInt64BE(11n, 2);
  const parsed = parseFrames(huge, { maxFrameBytes: 10, maxBufferBytes: 100 });
  assert.equal(parsed.close, true);
  assert.match(parsed.error, /too large/);
});

test("websocket parser leaves bounded incomplete frames buffered", () => {
  const incomplete = Buffer.from([0x81, 5, 0x68]);
  const parsed = parseFrames(incomplete, { maxFrameBytes: 10, maxBufferBytes: 10 });
  assert.equal(parsed.close, false);
  assert.equal(parsed.remaining.length, incomplete.length);
});
