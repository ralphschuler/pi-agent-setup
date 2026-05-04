let ws;
let reconnectTimer;
let state = { connected: false, lastError: "Not connected" };

async function getConfig() {
  const config = await chrome.storage.local.get({
    serverUrl: "ws://localhost:17373/bridge",
    token: "",
    autoConnect: true,
  });
  const url = new URL(config.serverUrl);
  if (config.token && !url.searchParams.has("token")) url.searchParams.set("token", config.token);
  return { ...config, fullUrl: url.toString() };
}

function setState(next) {
  state = { ...state, ...next };
  chrome.storage.local.set({ bridgeState: state }).catch(() => {});
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 3000);
}

async function connect() {
  const config = await getConfig();
  if (!config.autoConnect) return;
  try {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(config.fullUrl);
    ws.onopen = () => {
      setState({ connected: true, lastError: "", connectedAt: new Date().toISOString() });
      ws.send(JSON.stringify({ ok: true, event: "connected", userAgent: navigator.userAgent }));
    };
    ws.onmessage = async (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message.id) return;
      try {
        const result = await runCommand(message.action, message.args || {});
        ws.send(JSON.stringify({ id: message.id, ok: true, result }));
      } catch (error) {
        ws.send(JSON.stringify({ id: message.id, ok: false, error: error && error.message ? error.message : String(error) }));
      }
    };
    ws.onclose = () => {
      setState({ connected: false, lastError: "Disconnected" });
      scheduleReconnect();
    };
    ws.onerror = () => {
      setState({ connected: false, lastError: "WebSocket error" });
    };
  } catch (error) {
    setState({ connected: false, lastError: error && error.message ? error.message : String(error) });
    scheduleReconnect();
  }
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) throw new Error("No active tab found");
  return tabs[0];
}

async function executeInTab(fn, args = []) {
  const tab = await activeTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fn,
    args,
    world: "MAIN",
  });
  return results && results[0] ? results[0].result : undefined;
}

async function runCommand(action, args) {
  if (action === "hello") return { ok: true };

  if (action === "navigate") {
    if (!args.url) throw new Error("navigate requires url");
    const tab = await activeTab();
    await chrome.tabs.update(tab.id, { url: args.url });
    return { url: args.url };
  }

  if (action === "back" || action === "forward" || action === "reload") {
    const tab = await activeTab();
    if (action === "back") await chrome.tabs.goBack(tab.id);
    if (action === "forward") await chrome.tabs.goForward(tab.id);
    if (action === "reload") await chrome.tabs.reload(tab.id);
    return { action };
  }

  if (action === "click") {
    if (!args.selector) throw new Error("click requires selector");
    return executeInTab((selector) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`No element matches ${selector}`);
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
      return { clicked: selector, text: (el.innerText || el.value || el.getAttribute("aria-label") || "").slice(0, 500) };
    }, [args.selector]);
  }

  if (action === "type") {
    if (!args.selector) throw new Error("type requires selector");
    return executeInTab((selector, text) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`No element matches ${selector}`);
      el.scrollIntoView({ block: "center", inline: "center" });
      el.focus();
      if ("value" in el) {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
      }
      return { typed: selector, length: String(text).length };
    }, [args.selector, args.text || ""]);
  }

  if (action === "get_text") {
    return executeInTab((selector) => {
      const root = selector ? document.querySelector(selector) : document.body;
      if (!root) throw new Error(`No element matches ${selector}`);
      return (root.innerText || root.textContent || "").trim();
    }, [args.selector || ""]);
  }

  if (action === "get_html") {
    return executeInTab((selector) => {
      const root = selector ? document.querySelector(selector) : document.documentElement;
      if (!root) throw new Error(`No element matches ${selector}`);
      return root.outerHTML || root.innerHTML || "";
    }, [args.selector || ""]);
  }

  if (action === "evaluate") {
    if (!args.script) throw new Error("evaluate requires script");
    return executeInTab((script) => {
      // Expression-oriented evaluation. Wrap statements in an IIFE if needed.
      // Example: (() => { return document.title })()
      // eslint-disable-next-line no-eval
      const value = eval(script);
      if (value === undefined) return null;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return String(value);
      }
    }, [args.script]);
  }

  if (action === "screenshot") {
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
    return { dataUrl };
  }

  throw new Error(`Unknown action: ${action}`);
}

chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.serverUrl || changes.token || changes.autoConnect) {
    try { ws?.close(); } catch {}
    ws = undefined;
    connect();
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "connect") {
    connect().then(() => sendResponse({ ok: true, state })).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === "state") {
    sendResponse(state);
    return false;
  }
});

connect();
