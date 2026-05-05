# Scripts

The `scripts/` directory contains repository setup and validation helpers.

## Script reference

| Script                   | npm alias              | Purpose                                                               |
| ------------------------ | ---------------------- | --------------------------------------------------------------------- |
| `scripts/install.sh`     | `npm run install:pi`   | Install this repository as a pi package globally or locally.          |
| `scripts/uninstall.sh`   | `npm run uninstall:pi` | Remove this pi package globally or locally.                           |
| `scripts/update.sh`      | `npm run update:pi`    | Pull/update dependencies, validate, and refresh the pi package entry. |
| `scripts/check.sh`       | `npm run check`        | Run TypeScript and lint validation.                                   |
| `scripts/test-docker.sh` | `npm run test:docker`  | Build/smoke test Docker behavior.                                     |

## Install options

```bash
scripts/install.sh --global
scripts/install.sh --local
```

Environment alternative:

```bash
PI_SCOPE=local scripts/install.sh
```

## Update options

```bash
scripts/update.sh --no-pull
scripts/update.sh --no-check
```

Environment alternatives:

```bash
PI_SETUP_PULL=0 scripts/update.sh
PI_SETUP_CHECK=0 scripts/update.sh
```

## Validation scripts

Use `npm run check` before committing extension changes. Use `npm run test:ci` before larger changes or releases.
