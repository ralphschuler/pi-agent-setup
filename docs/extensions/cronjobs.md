# Cronjobs

`extensions/cronjobs/` adds durable scheduling for agent follow-ups.

## Provides

- Agent-facing `cronjob` tool
- Persistent markdown store at `~/.pi/agent/cronjobs.md`
- Base64-encoded task bodies to prevent Markdown structure injection
- Footer/widget status for upcoming jobs
- Private atomic store writes and at-least-once dispatch state

## Supported schedules

- ISO date/time
- `every <n> minutes|hours|days`
- `daily HH:MM`
- Simple 5-field cron expressions

## Behavior

Jobs can be scheduled only from a persistent pi session. When a job is due, its task is sent back into its originating pi session as a user message for the agent to execute. Jobs persist the originating session ID and working directory, so another repo or session cannot receive them. Dispatches persist a UUID, attempt count, and pending/sent state before delivery; a failed or interrupted dispatch retries with the same ID. Overdue one-shot jobs remain due and are recovered when their originating session resumes.

Legacy jobs without session scope are not dispatched. Schedule them again from the intended session instead of allowing an unrelated session to claim them.

Invalid schedules, zero intervals, out-of-range cron values, and impossible next-run searches are rejected. Cron search is bounded to one year.

## Good uses

- Reminders
- Follow-ups
- Periodic checks
- Recurring maintenance
