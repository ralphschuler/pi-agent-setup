# Web terminal

`extensions/web-terminal/` exposes this pi session through an authenticated browser/PWA terminal.

## Provides

- `/web-terminal` command
- Agent-facing `web_terminal` setup/status tool
- Hyper-inspired xterm.js terminal UI
- PWA assets under `extensions/web-terminal/public/`

## Activation and security

The server is inactive until `/web-terminal` or `web_terminal` setup activates it.

It binds to localhost by default. LAN access is opt-in:

```bash
PI_WEB_TERMINAL_HOST=0.0.0.0
```

## More information

See `extensions/web-terminal/README.md` for setup and usage details.
