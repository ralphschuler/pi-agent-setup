# Pi Browser Bridge

Pi extension plus Chrome/Edge companion extension for controlling a browser on another machine.

## Setup

1. Start or reload pi with this package installed.
2. Run `/browser-bridge` or call `browser_bridge` with `action: "setup"`.
3. On the browser machine, copy `extensions/browser-bridge/browser-extension/`.
4. Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked** for that folder.
5. In the extension popup, enter:
   - WebSocket URL: `ws://<pi-machine-ip>:17373/bridge`
   - Token: the token shown by `/browser-bridge`
6. The agent can then use the `browser_bridge` tool.

## Configuration

Environment variables on the pi machine:

- `PI_BROWSER_BRIDGE_HOST` (default `0.0.0.0`)
- `PI_BROWSER_BRIDGE_PORT` (default `17373`)
- `PI_BROWSER_BRIDGE_TOKEN` (default random per pi process)

Use a fixed token when connecting from another machine repeatedly:

```bash
PI_BROWSER_BRIDGE_TOKEN="change-me" pi
```

## Security notes

The bridge can navigate pages, click/type, read page content, run page-scoped JavaScript, and capture screenshots in the connected browser. Keep the token secret and expose the port only on trusted networks or through an SSH tunnel/VPN.
