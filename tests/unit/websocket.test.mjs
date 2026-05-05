import assert from "node:assert/strict";
import test from "node:test";

import { parseFrames } from "../../extensions/shared/websocket.ts";

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
