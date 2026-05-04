# Pi Web Terminal

A pi extension that serves a Hyper-inspired browser terminal/PWA and connects each browser tab to a running `pi` terminal session. It also includes pi-mobile-style mobile screens for chat, status, tasks, files, logs, cron, tools/skills, CRM, calendar, extensions, and settings.

## Usage

1. Install/reload this pi package.
2. Run `/web-terminal` in pi, or ask the agent to call `web_terminal` with `action: "setup"`.
3. Open the authenticated URL shown by pi.
4. Use the browser install button to add it as a PWA.

Each connected terminal tab launches a child command in a pseudo-terminal. By default that command is:

```bash
pi -c
```

## Mobile/PWA features

- **Terminal** — Hyper-inspired xterm.js terminal connected to a child pi session.
- **Chat** — send prompts to the current pi session and stream responses via SSE.
- **Status** — agent health, system metrics, cwd, terminal clients, and tool count.
- **Tasks** — optional `td` integration for viewing issues; API also supports create/start/close/reopen when `td` is installed.
- **Files** — browse workspace files and read file contents with cwd sandboxing.
- **Logs** — live SSE log stream for agent, tool, chat, and terminal activity.
- **Cron** — optional `pi-cron` integration for viewing jobs; API also supports toggle/run when `pi-cron` is installed.
- **Skills** — searchable registered tool/skill list.
- **CRM** — optional `pi-crm` integration for viewing contacts and creating contacts when `pi-crm` is installed.
- **Calendar** — optional `pi-calendar` integration for viewing events and creating events when `pi-calendar` is installed.
- **Extensions** — grouped registered tools/extensions.
- **Settings** — connection and runtime configuration.

## Configuration

- `PI_WEB_TERMINAL_HOST` — bind host, default `0.0.0.0`
- `PI_WEB_TERMINAL_PORT` — bind port, default `17474`
- `PI_WEB_TERMINAL_TOKEN` — optional initial access token; `/web-terminal` and `web_terminal` setup generate a fresh token and URL each time
- `PI_WEB_TERMINAL_COMMAND` — child command, default `pi -c`
- `PI_WEB_TERMINAL_TERM` — child `TERM`, default `xterm-256color`

The implementation uses the system `script` command to allocate a pseudo-terminal without native dependencies. If your system does not provide `script`, install `util-linux` (Linux) or set `PI_WEB_TERMINAL_COMMAND` and adapt the extension to your PTY launcher.

Optional mobile integrations call external CLIs when present: `td`, `pi-cron`, `pi-crm`, and `pi-calendar`. Missing commands are reported as integration errors in the UI rather than required for the terminal itself.

## Security

The web terminal is equivalent to local terminal access as your user. Keep the token secret and expose the port only on trusted networks, localhost, SSH tunnels, or VPNs.
