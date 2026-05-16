# Pi screen wrapper

`pi-screen` starts Pi inside GNU screen so sessions can run unattended and be resumed after disconnects.

## Requirements

- GNU screen on `PATH`
- `pi` on `PATH`

## Behavior

- Inside a Git repository, `pi-screen` attaches to the existing live repo-scoped session or creates one.
- outside a Git repository, `pi-screen` opens a small TUI picker that shows only pi-screen sessions and a create-new option.
- If a session already exists and Pi args are supplied, `pi-screen` attaches and warns that the new args were not applied. Use `--new` or another `--name` for a separate session.
- Non-TTY outside a repository prints the managed session list and example commands instead of opening the picker.
- Each run reads `screen -ls` fresh; dead screen sockets are ignored so a vanished repo session creates a new session instead of trying to resume the dead one.

Managed sessions use names like `pi-<slug>-<hash>` so unrelated and dead screen sessions are not shown in the picker.

## Common commands

```bash
pi-screen
pi-screen --detach -- "continue the approved implementation"
pi-screen --list
pi-screen --name docs --new
```

Manual GNU screen fallbacks:

```bash
screen -ls
screen -r <session-name>
```

Detach from an attached screen session with `Ctrl-a d`.

## Options

| Option        | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `--name NAME` | Use a specific pi-screen session name/slug.         |
| `--new`       | Create a new session even if one exists.            |
| `--detach`    | Start a new session detached for unattended work.   |
| `--list`      | List only live `pi-screen`-managed sessions.        |
| `--dry-run`   | Print the GNU screen command instead of running it. |
| `--help`      | Show CLI help.                                      |

## Security and operations

`pi-screen` runs local shell programs (`screen` and `pi`) with your normal user permissions. Avoid putting secrets in command-line arguments because process listings and shell history may expose them.

Rollback/stop point: remove the `pi-screen` bin entry from `package.json` or run `pi` directly if the wrapper is not desired.
