const serverUrl = document.getElementById("serverUrl");
const token = document.getElementById("token");
const autoConnect = document.getElementById("autoConnect");
const statusBox = document.getElementById("status");
const save = document.getElementById("save");

async function refresh() {
  const data = await chrome.storage.local.get({
    serverUrl: "ws://localhost:17373/bridge",
    token: "",
    autoConnect: true,
    bridgeState: { connected: false, lastError: "Not connected" },
  });
  serverUrl.value = data.serverUrl;
  token.value = data.token;
  autoConnect.checked = data.autoConnect;
  statusBox.className = `status ${data.bridgeState.connected ? "ok" : "bad"}`;
  statusBox.textContent = data.bridgeState.connected
    ? `Connected${data.bridgeState.connectedAt ? ` since ${data.bridgeState.connectedAt}` : ""}`
    : `Disconnected: ${data.bridgeState.lastError || "unknown"}`;
}

save.addEventListener("click", async () => {
  await chrome.storage.local.set({
    serverUrl: serverUrl.value.trim(),
    token: token.value.trim(),
    autoConnect: autoConnect.checked,
  });
  chrome.runtime.sendMessage({ type: "connect" }, () => setTimeout(refresh, 500));
});

refresh();
setInterval(refresh, 1000);
