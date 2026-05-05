# Safety guard

`extensions/safety-guard/` protects against dangerous and policy-sensitive tool calls.

## Behavior

The extension evaluates tool calls against policy rules and either allows, asks for confirmation, or blocks the action.

Covered policy categories:

- dangerous shell commands such as destructive root deletes
- package install commands such as `npm install`, `pnpm add`, `yarn add`, `bun add`, and `pip install`
- network exposure patterns such as `--host 0.0.0.0`
- protected paths such as `/etc`, `/usr`, `/dev`, `/proc`, `/sys`, and `~/.ssh`

Protected paths are blocked. Risky but potentially intentional actions require confirmation when UI is available and are blocked when UI is unavailable.

## Audit log

Policy decisions are appended to:

```text
~/.pi/agent/policy-guard-audit.log
```

Audit logging is best-effort and never weakens a block/confirmation decision.

## Purpose

It reduces accidental damage while preserving the ability to approve intentional risky operations.
