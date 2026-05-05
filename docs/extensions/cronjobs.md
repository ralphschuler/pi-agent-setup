# Cronjobs

`extensions/cronjobs/` adds durable scheduling for agent follow-ups.

## Provides

- Agent-facing `cronjob` tool
- Persistent markdown store at `~/.pi/agent/cronjobs.md`
- Base64-encoded task bodies to prevent Markdown structure injection
- Footer/widget status for upcoming jobs

## Supported schedules

- ISO date/time
- `every <n> minutes|hours|days`
- `daily HH:MM`
- Simple 5-field cron expressions

## Behavior

When a job is due, its task is sent back into pi as a user message for the agent to execute.

## Good uses

- Reminders
- Follow-ups
- Periodic checks
- Recurring maintenance
