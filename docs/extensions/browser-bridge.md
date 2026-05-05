# Browser bridge

`extensions/browser-bridge/` lets pi control a connected Chrome or Edge browser through a companion browser extension.

## Provides

- `/browser-bridge` setup command
- `browser_bridge` agent-facing tool
- Companion extension under `extensions/browser-bridge/browser-extension/`

## Capabilities

The tool supports browser status/setup plus page operations:

- Navigate, back, forward, reload
- Click and type
- Read page text or HTML
- Evaluate page-scoped JavaScript
- Capture screenshots

## Activation and security

The bridge is inactive until `/browser-bridge`, `browser_bridge` setup, or a browser action activates it.

It binds to localhost by default. LAN access is opt-in:

```bash
PI_BROWSER_BRIDGE_HOST=0.0.0.0
```

## More information

See `extensions/browser-bridge/README.md` for companion-extension setup details.
