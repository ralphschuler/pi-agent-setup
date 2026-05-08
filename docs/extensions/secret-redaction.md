# Secret redaction

`extensions/secret-redaction/` redacts known local secrets from text before it is sent to LLM providers or child subagents.

## Scope

The extension builds an in-memory inventory from approved local sources only:

- environment variables with names that look like tokens, keys, passwords, auth values, credentials, or cookies
- optional explicit local config at `~/.pi/agent/secret-redaction.json`

It does not scan `.env` files, SSH keys, OS keychains, browser stores, or arbitrary protected files by default.

## Behavior

- Redacts matching strings during the `context` hook before model context is sent.
- Redacts provider payload strings during the `before_provider_request` hook.
- Redacts subagent task text before writing child prompt files.
- Redacts subagent live stdout/stderr previews and final returned text.
- Applies a minimum secret length threshold to avoid redacting short common strings.
- Redacts exact values plus common encoded forms such as Base64 and URL encoding.

Raw secret values are never reported. Internal reports track counts by source/category only.

## Optional config

Create `~/.pi/agent/secret-redaction.json` when explicit local values or regex patterns are needed:

```json
{
  "values": ["replace-with-local-secret-value"],
  "patterns": ["gho_[A-Za-z0-9_]+"]
}
```

Keep this file local. Do not commit it.

## Security notes

- The inventory stays in memory.
- Invalid, empty, overly long, or obviously unsafe config regex entries are ignored without logging raw values.
- Nested quantified patterns such as `(a+)+$` and quantified alternations such as `(a|aa)+$` or `(?:a|aa)+$` are rejected to reduce catastrophic-backtracking/ReDoS risk.
- Overly broad patterns may remove useful context; overly narrow values may miss transformed secrets.
- Rollback: disable the extension by removing `extensions/secret-redaction/` from the installed package or reverting this extension and subagent redaction calls.

## Validation

```bash
node --test tests/unit/secret-redaction.test.mjs
node --test tests/unit/subagent-modules.test.mjs
npm run test:unit
```
