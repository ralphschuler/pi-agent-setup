# Caveman

`extensions/caveman/` registers `/caveman`, a command for toggling terse English-only assistant language.

## Modes

- `lite`
- `full`
- `ultra`

## Usage

```text
/caveman lite
/caveman off
```

The extension changes assistant style, not tool behavior or repository state. It always instructs the assistant to answer in English only.

Caveman compresses prose and hidden guidance to reduce token pressure. Required templates, checklists, exact commands, paths, errors, logs, and safety details stay intact; surrounding explanation should get shorter.

After editing the extension, restart pi or run `/reload`.
