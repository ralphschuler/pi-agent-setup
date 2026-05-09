# Bootstrap command

`/bootstrap` prepares the current Git repository for pi agent work by creating durable project context files:

- `CONTEXT.md`
- `docs/adr/README.md`
- `docs/adr/0001-record-architecture-decisions.md`

It refuses to run outside a Git repository and preserves existing files by default.

## Usage

```text
/bootstrap
/bootstrap --dry-run
/bootstrap --force
/bootstrap --path ../other-repo
```

## Workflow

1. Run `/bootstrap` in a repository.
2. Fill the TODOs in `CONTEXT.md`.
3. Add or update ADRs in `docs/adr/` for durable architecture decisions.
4. Ask pi to inspect `CONTEXT.md` and relevant ADRs before non-trivial planning or implementation.

Rollback/stop point: delete the generated starter files if the repository should not use pi context/ADR conventions.
