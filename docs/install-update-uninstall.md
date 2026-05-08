# Install, update, uninstall

## Install globally

Install this package for all pi sessions:

```bash
bash scripts/install.sh
# or
npm run install:pi
```

Pi can install the repository directly. This helper script installs the current checkout with `pi install` and links runnable aliases:

- `~/.local/bin/pi-acp` -> `./bin/pi-acp.mjs`
- `~/.local/bin/pi-screen` -> `./bin/pi-screen.mjs`

Override the alias directory with `PI_ALIAS_DIR`.

## Install locally

Install into the current project only:

```bash
bash scripts/install.sh --local
```

## Reload after install

After install or extension changes, restart pi or run:

```text
/reload
```

## Update

```bash
bash scripts/update.sh
# or
npm run update:pi
```

The update script pulls latest git changes when this checkout is a git repository, refreshes package dependencies, refreshes aliases, and asks pi to update this package entry.

Uninstall removes the selected pi package entry and removes matching `pi-acp` and `pi-screen` aliases.

## Uninstall globally

```bash
bash scripts/uninstall.sh
# or
npm run uninstall:pi
```

## Uninstall local install

```bash
bash scripts/uninstall.sh --local
```

## Package declaration

The package exposes pi resources through `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```
