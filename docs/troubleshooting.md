# Troubleshooting

## Extension changes do not appear

Run:

```text
/reload
```

If resources still do not appear, reinstall the package:

```bash
npm run install:pi
```

## `pi` command is missing

Install or activate the pi CLI before running repository install/update scripts. The install script exits if `pi` is not found in `PATH`.

## Peer dependency install issues

Use the repository's expected install command:

```bash
npm ci --legacy-peer-deps
```

or for install/update scripts, let them run npm with `--legacy-peer-deps`.

## SearXNG search fails

The `search` tool defaults to `http://localhost:8080`. Start SearXNG locally or set:

```bash
SEARXNG_URL=https://your-searxng.example
```

## Browser bridge cannot connect

- Run `/browser-bridge` for setup details.
- Install/load the companion browser extension from `extensions/browser-bridge/browser-extension/`.
- Keep localhost binding unless you intentionally opt into LAN access with `PI_BROWSER_BRIDGE_HOST=0.0.0.0`.

## Web terminal is unreachable

- Run `/web-terminal` for the authenticated setup URL.
- By default it binds to localhost.
- LAN access requires `PI_WEB_TERMINAL_HOST=0.0.0.0`.
- If status still shows `127.0.0.1`, export the variable in the shell that starts `pi`, then run `/reload` or restart pi and run `/web-terminal` again. Use the shown LAN URL, not `localhost`, from Safari on another device.

## GitHub Pages does not deploy

Check repository settings:

```text
Settings → Pages → Source → GitHub Actions
```

Also check the `docs` workflow run for `mkdocs build --strict` failures.

## Docs build fails locally

Install docs dependencies first:

```bash
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```

Broken internal links, missing nav files, or invalid YAML in `mkdocs.yml` will fail strict builds.
