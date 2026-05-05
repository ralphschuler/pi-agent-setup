const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const statusEl = $("#status");
let currentPath = ".";
let logEntries = [];
function card(title, body = "", meta = "") {
  return `<div class="item"><h3>${esc(title)}</h3>${meta ? `<div class="muted">${esc(meta)}</div>` : ""}<div>${body}</div></div>`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
async function api(path, opts) {
  const r = await fetch(`/api${path}`, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function setStatus(t) {
  statusEl.textContent = t;
}

const term = new Terminal({
  cursorBlink: true,
  cursorStyle: "bar",
  fontFamily: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
  fontSize: 14,
  lineHeight: 1.18,
  scrollback: 8000,
  allowTransparency: true,
  theme: {
    background: "#10101800",
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
    brightWhite: "#fff",
  },
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open($("#terminal"));
fitAddon.fit();
let socket,
  reconnectTimer,
  manualClose = false;
function wsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    cols: String(term.cols),
    rows: String(term.rows),
  });
  const token = new URLSearchParams(location.search).get("token");
  if (token) params.set("token", token);
  return `${protocol}//${location.host}/terminal?${params}`;
}
function connect() {
  clearTimeout(reconnectTimer);
  manualClose = false;
  if (socket && socket.readyState <= 1) socket.close();
  fitAddon.fit();
  setStatus("terminal connecting…");
  socket = new WebSocket(wsUrl());
  socket.addEventListener("open", () => {
    setStatus("terminal connected");
    term.writeln("\x1b[38;2;104;225;253mConnected to Pi Web Terminal.\x1b[0m");
  });
  socket.addEventListener("message", (e) => {
    let p;
    try {
      p = JSON.parse(e.data);
    } catch {
      return;
    }
    if (p.type === "output") term.write(p.data);
    if (p.type === "status") term.write(`\x1b[38;2;138;124;255m${p.text}\x1b[0m`);
    if (p.type === "exit") {
      term.write(`\x1b[38;2;255;209;102m${p.text || "\r\n[terminal exited]\r\n"}\x1b[0m`);
      setStatus("terminal exited");
    }
  });
  socket.addEventListener("close", () => {
    if (manualClose) return;
    setStatus("terminal disconnected; retrying…");
    reconnectTimer = setTimeout(connect, 1500);
  });
  socket.addEventListener("error", () => setStatus("terminal error"));
}
term.onData((data) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data }));
});
window.addEventListener("resize", () => {
  fitAddon.fit();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
});

async function loadStatus() {
  const d = await api("/status");
  $("#status-grid").innerHTML = [
    card("Agent", `${d.agent.status}<br><span class=muted>${esc(d.agent.cwd)}</span>`),
    card(
      "System",
      `Node ${d.system.nodeVersion}<br>${d.system.platform}/${d.system.arch}<br>RSS ${d.system.memoryMB} MB<br>Uptime ${d.system.uptimeSeconds}s`,
    ),
    card("Tools", `${d.tools.count} tools<br><span class=muted>${esc(d.tools.names?.slice(0, 20).join(", "))}</span>`),
    card("Terminal", `${d.terminal.clients} connected on :${d.terminal.port}`),
  ].join("");
}
async function loadSettings() {
  const d = await api("/settings");
  $("#settings-grid").innerHTML = Object.entries(d)
    .map(([k, v]) => card(k, esc(v)))
    .join("");
}
async function loadGeneric(path, id, key) {
  try {
    const d = await api(path);
    const arr = d[key] || d.issues || d.jobs || d.contacts || d.events || [];
    $(id).innerHTML =
      Array.isArray(arr) && arr.length
        ? arr
            .map((x) => card(x.title || x.name || x.id || JSON.stringify(x).slice(0, 60), `<pre>${esc(JSON.stringify(x, null, 2))}</pre>`))
            .join("")
        : card("Empty", `No ${key} found`);
  } catch (e) {
    $(id).innerHTML = card("Unavailable", esc(e.message));
  }
}
async function loadSkills() {
  const d = await api("/skills");
  $("#skills-list").innerHTML = d.skills.map((s) => card(s.name, esc(s.description))).join("") || card("No tools");
}
async function loadExtensions() {
  const d = await api("/extensions");
  $("#extensions-list").innerHTML =
    d.extensions.map((e) => card(e.name, `${e.toolCount} tools<br><span class=muted>${esc(e.tools.join(", "))}</span>`)).join("") ||
    card("No extensions");
}
async function loadFiles(path = currentPath) {
  currentPath = path || ".";
  $("#file-path").textContent = currentPath;
  try {
    const d = await api(`/files/list?path=${encodeURIComponent(currentPath)}`);
    $("#files-list").innerHTML =
      d.items
        .map(
          (i) =>
            `<button class="item file" data-path="${esc(i.path)}" data-type="${i.type}"><h3>${i.type === "directory" ? "📁" : "📄"} ${esc(i.name)}</h3><span class=muted>${esc(i.size)} bytes</span></button>`,
        )
        .join("") || card("Empty");
    $$(".file").forEach(
      (b) =>
        (b.onclick = async () => {
          if (b.dataset.type === "directory") loadFiles(b.dataset.path);
          else {
            const f = await api(`/files/read?path=${encodeURIComponent(b.dataset.path)}`);
            $("#file-content").textContent = f.content;
          }
        }),
    );
  } catch (e) {
    $("#files-list").innerHTML = card("Error", esc(e.message));
  }
}
function renderLogs() {
  const level = $("#log-level").value;
  $("#logs-list").innerHTML =
    logEntries
      .filter((l) => !level || l.level === level)
      .slice(-200)
      .reverse()
      .map(
        (l) =>
          `<div class="item"><span class="level-${esc(l.level)}">${esc(l.level)}</span> <span class=muted>${esc(l.time)} ${esc(l.source)}</span><br>${esc(l.msg)}</div>`,
      )
      .join("") || card("No logs");
}
async function initLogs() {
  try {
    const d = await api("/logs");
    logEntries = d.logs || [];
    renderLogs();
  } catch {}
  const es = new EventSource("/api/logs/events");
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.level) {
      logEntries.push(d);
      renderLogs();
    }
  };
}
function initChat() {
  const log = $("#chat-log");
  const add = (who, text) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<span class=badge>${who}</span><div>${esc(text)}</div>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };
  $("#chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    const prompt = input.value.trim();
    if (!prompt) return;
    const send = $("#chat-send");
    input.value = "";
    if (send) send.disabled = true;
    add("you", prompt);
    try {
      await api("/chat/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    } catch (error) {
      input.value = prompt;
      add("error", `Failed to send prompt: ${error.message}`);
      setStatus("chat send failed");
    } finally {
      if (send) send.disabled = false;
    }
  };
  const es = new EventSource("/api/chat/events");
  let acc = "";
  es.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.type === "text_delta") {
      acc += d.delta;
      setStatus("streaming…");
    }
    if (d.type === "turn_end") {
      const text =
        d.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n") || acc;
      if (text) add("pi", text);
      acc = "";
      setStatus("idle");
    }
    if (d.type === "tool_start") add("tool", `→ ${d.toolName}`);
  };
}

const loaders = {
  terminal: () => fitAddon.fit(),
  chat: () => {},
  status: loadStatus,
  tasks: () => loadGeneric("/tasks", "#tasks-list", "issues"),
  files: () => loadFiles(),
  logs: () => renderLogs(),
  cron: () => loadGeneric("/cron", "#cron-list", "jobs"),
  skills: loadSkills,
  crm: () => loadGeneric("/crm", "#crm-list", "contacts"),
  calendar: () => loadGeneric("/calendar", "#calendar-list", "events"),
  extensions: loadExtensions,
  settings: loadSettings,
};
$$(".tabs button").forEach(
  (btn) =>
    (btn.onclick = () => {
      const tab = btn.dataset.tab;
      $$(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${tab}`));
      loaders[tab]?.();
    }),
);
$("#refresh").onclick = () => loaders[$(".tabs button.active").dataset.tab]?.();
$("#file-up").onclick = () => loadFiles(currentPath === "." ? "." : currentPath.split("/").slice(0, -1).join("/") || ".");
$("#log-level").onchange = renderLogs;
$$(".search").forEach(
  (i) =>
    (i.oninput = () => {
      const q = i.value.toLowerCase();
      document
        .querySelectorAll(`#${i.dataset.target} .item`)
        .forEach((x) => (x.style.display = x.textContent.toLowerCase().includes(q) ? "" : "none"));
    }),
);
let deferredInstallPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $("#install").hidden = false;
});
$("#install").onclick = async () => {
  await deferredInstallPrompt?.prompt();
  deferredInstallPrompt = undefined;
  $("#install").hidden = true;
};
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
connect();
initChat();
initLogs();
loadStatus();
