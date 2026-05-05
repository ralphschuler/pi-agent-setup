# Package Scout

`extensions/package-scout/` adds audit-first npm package discovery for Pi-related packages.

## Tool

`package_scout` audits npm registry metadata without installing packages.

Inputs:

- `packages` — exact npm package names to audit.
- `query` — npm search query when exact names are not known.
- `limit` — maximum packages to audit from search results.

The report includes:

- package name and latest version
- description
- license
- repository
- publish/modified dates and freshness
- risk status: `consider`, `avoid`, or `audit needed`
- risk reasons

## Command

```text
/package-scout <package names or npm search query>
```

The command queues a workflow prompt that tells the agent to call `package_scout` and avoid install commands.

## Safety

Package Scout is metadata-only. It fetches npm registry/search JSON and never installs packages. Treat `consider` as a signal to inspect source before adoption, not as installation approval.
