import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";

import {
  LOCALHOST_BIND_HOST,
  isLanBindHost,
  isLocalhostHost,
  localNetworkUrls,
  normalizeHost,
  normalizePort,
} from "../../extensions/shared/local-network.ts";

test("local network urls preserve localhost-by-default", () => {
  assert.equal(LOCALHOST_BIND_HOST, "127.0.0.1");
  assert.deepEqual(localNetworkUrls(17474), ["http://localhost:17474"]);
  assert.deepEqual(localNetworkUrls(17474, "127.0.0.1"), ["http://localhost:17474"]);
  assert.deepEqual(localNetworkUrls(17474, "localhost"), ["http://localhost:17474"]);
  assert.deepEqual(localNetworkUrls(17474, "::1"), ["http://localhost:17474"]);
});

test("local network urls include explicit non-localhost host", () => {
  assert.deepEqual(localNetworkUrls(17474, "devbox.local"), ["http://localhost:17474", "http://devbox.local:17474"]);
  assert.deepEqual(localNetworkUrls(17474, "192.0.2.10"), ["http://localhost:17474", "http://192.0.2.10:17474"]);
});

test("local network urls expand LAN opt-in bind hosts", () => {
  const original = os.networkInterfaces;
  os.networkInterfaces = () => ({
    lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    eth0: [{ family: "IPv4", internal: false, address: "192.168.1.50" }],
    wlan0: [{ family: "IPv6", internal: false, address: "fe80::1" }],
  });
  try {
    assert.deepEqual(localNetworkUrls(17474, "0.0.0.0"), ["http://localhost:17474", "http://192.168.1.50:17474"]);
    assert.deepEqual(localNetworkUrls(17474, "::"), ["http://localhost:17474", "http://192.168.1.50:17474"]);
  } finally {
    os.networkInterfaces = original;
  }
});

test("local network host policy helpers classify bind hosts", () => {
  assert.equal(isLocalhostHost("127.0.0.1"), true);
  assert.equal(isLocalhostHost("localhost"), true);
  assert.equal(isLocalhostHost("example.test"), false);
  assert.equal(isLanBindHost("0.0.0.0"), true);
  assert.equal(isLanBindHost("::"), true);
  assert.equal(isLanBindHost("127.0.0.1"), false);
});

test("local network normalizers validate host and port", () => {
  assert.equal(normalizeHost(" devbox.local "), "devbox.local");
  assert.equal(normalizeHost(""), undefined);
  assert.throws(() => normalizeHost("bad/host"), /Invalid host/);
  assert.equal(normalizePort("17474"), 17474);
  assert.equal(normalizePort(undefined), undefined);
  assert.throws(() => normalizePort(70000), /Invalid port/);
});
