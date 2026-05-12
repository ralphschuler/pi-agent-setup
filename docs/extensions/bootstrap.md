# Bootstrap command

`/bootstrap` prepares the current Git repository for pi agent work by creating durable project context files:

- `CONTEXT.md`
- `docs/adr/README.md`
- `docs/adr/0001-record-architecture-decisions.md`

For GitHub repositories, or repositories that already contain `.github/`, it also creates GitHub issue-template starter files:

- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/documentation.yml`
- `.github/ISSUE_TEMPLATE/security_hardening.yml`
- `.github/ISSUE_TEMPLATE/architecture_refactor.yml`
- `.github/ISSUE_TEMPLATE/question.yml`

Blank issues stay enabled (`blank_issues_enabled: true`) so free-form issues can still route through `/triage` later.

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
4. For GitHub repos, review the issue forms and adjust labels/fields if the repo uses a different label taxonomy.
5. Ask pi to inspect `CONTEXT.md` and relevant ADRs before non-trivial planning or implementation.

Rollback/stop point: delete the generated starter files if the repository should not use pi context/ADR/issue-template conventions.
