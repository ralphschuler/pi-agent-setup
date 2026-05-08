# Install, update, uninstall

## Install globally

Install this package for all pi sessions:

```bash
bash scripts/install.sh
# or
npm run install:pi
```

Pi can install the repository directly. This helper script installs the current checkout with `pi install`, links runnable aliases, and adds the alias directory to your shell startup file:

- `~/.local/bin/pi-acp` -> `./bin/pi-acp.mjs`
- `~/.local/bin/pi-screen` -> `./bin/pi-screen.mjs`

Override the alias directory with `PI_ALIAS_DIR`. Override the shell startup file with `PI_SETUP_SHELL_RC`; otherwise the script chooses `~/.zshrc`, `~/.bashrc`, or `~/.profile`. Open a new shell or source the updated file before running `pi-acp` or `pi-screen` by name.

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

The update script pulls latest git changes when this checkout is a git repository, refreshes package dependencies, refreshes aliases and PATH setup, and asks pi to update this package entry.

Uninstall removes the selected pi package entry, matching `pi-acp` and `pi-screen` aliases, and the managed PATH block.

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
