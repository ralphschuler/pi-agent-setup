const statusEl = document.querySelector("#status");
const terminalEl = document.querySelector("#terminal");

function setStatus(text, sticky = false) {
  statusEl.textContent = text;
  statusEl.classList.add("visible");
  clearTimeout(setStatus.timer);
  if (!sticky) setStatus.timer = setTimeout(() => statusEl.classList.remove("visible"), 2200);
}

const term = new Terminal({
  cursorBlink: true,
  cursorStyle: "bar",
  fontFamily: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
  fontSize: 14,
  lineHeight: 1.18,
  scrollback: 12000,
  allowTransparency: false,
  convertEol: false,
  rightClickSelectsWord: true,
  macOptionIsMeta: true,
  theme: {
    background: "#0a0a0f",
    foreground: "#f5f5f7",
    cursor: "#68e1fd",
    selectionBackground: "#8a7cff55",
    black: "#1b1b24",
    red: "#ff6b7a",
    green: "#69f0ae",
    yellow: "#ffd166",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#68e1fd",
    white: "#f5f5f7",
    brightBlack: "#5f6170",
    brightRed: "#ff8b94",
    brightGreen: "#8ff8c3",
    brightYellow: "#ffe08a",
    brightBlue: "#a8beff",
    brightMagenta: "#ddb3ff",
    brightCyan: "#9becff",
    brightWhite: "#ffffff",
  },
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(terminalEl);
fitAddon.fit();
term.focus();

let socket;
let reconnectTimer;
let manualClose = false;

function token() {
  return new URLSearchParams(location.search).get("token");
}

function wsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
  const t = token();
  if (t) params.set("token", t);
  return `${protocol}//${location.host}/terminal?${params}`;
}

function connect() {
  clearTimeout(reconnectTimer);
  manualClose = false;
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
  fitAddon.fit();
  setStatus("connecting…", true);
  socket = new WebSocket(wsUrl());
  socket.addEventListener("open", () => {
    setStatus("connected");
    term.focus();
  });
  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === "output") term.write(payload.data);
    if (payload.type === "status") term.write(`\x1b[38;2;138;124;255m${payload.text}\x1b[0m`);
    if (payload.type === "exit") {
      term.write(`\x1b[38;2;255;209;102m${payload.text || "\r\n[terminal exited]\r\n"}\x1b[0m`);
      setStatus("terminal exited", true);
    }
  });
  socket.addEventListener("close", () => {
    if (manualClose) return;
    setStatus("disconnected; retrying…", true);
    reconnectTimer = setTimeout(connect, 1500);
  });
  socket.addEventListener("error", () => setStatus("terminal error", true));
}

term.onData((data) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
});

function resize() {
  fitAddon.fit();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 250));
window.addEventListener("beforeunload", () => {
  manualClose = true;
  socket?.close();
});
window.addEventListener("pointerdown", () => term.focus());

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
connect();
