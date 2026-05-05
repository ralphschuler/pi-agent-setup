# Install, update, uninstall

## Install globally

Install this package for all pi sessions:

```bash
bash scripts/install.sh
# or
npm run install:pi
```

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

The update script pulls latest git changes when this folder is a git repository, runs validation, and asks pi to refresh this local package entry.

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
