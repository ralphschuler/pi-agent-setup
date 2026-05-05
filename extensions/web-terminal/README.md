# Pi Web Terminal

A pi extension that serves a terminal-only browser/PWA and connects each browser tab to a running `pi` terminal session.

## Usage

1. Install/reload this pi package.
2. Run `/web-terminal` in pi, or ask the agent to call `web_terminal` with `action: "setup"`. The server stays inactive until this step activates it.
3. Open the authenticated URL shown by pi.
4. Add it as a PWA from the browser menu if desired.

Each connected terminal tab launches a child command in a pseudo-terminal. By default that command is:

```bash
pi -c
```

## PWA behavior

The web UI is intentionally terminal-only: no bottom navigation, chat, files, logs, tools, or settings screens. Plain Markdown output from the child command is converted to ANSI styling before it reaches xterm.js. Existing terminal control sequences are passed through unchanged. Set `PI_WEB_TERMINAL_MARKDOWN=0` to disable this fallback renderer.

## Configuration

- `PI_WEB_TERMINAL_HOST` — bind host, default `127.0.0.1`. Set `0.0.0.0` only when you intentionally want LAN/remote access.
- `PI_WEB_TERMINAL_PORT` — bind port, default `17474`
- `PI_WEB_TERMINAL_TOKEN` — optional initial access token; `/web-terminal` and `web_terminal` setup generate a fresh token and URL each time
- `PI_WEB_TERMINAL_COMMAND` — child command, default `pi -c`
- `PI_WEB_TERMINAL_TERM` — child `TERM`, default `xterm-256color`

The implementation uses the system `script` command to allocate a pseudo-terminal without native dependencies. If your system does not provide `script`, install `util-linux` (Linux) or set `PI_WEB_TERMINAL_COMMAND` and adapt the extension to your PTY launcher.

## Security

The web terminal is equivalent to local terminal access as your user. It binds to localhost by default so browser/RPC access stays on the local machine. Keep the token secret. Expose the port with `PI_WEB_TERMINAL_HOST=0.0.0.0` only on trusted networks, SSH tunnels, or VPNs.
