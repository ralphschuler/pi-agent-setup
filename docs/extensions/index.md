# Extensions

Extensions are TypeScript modules that customize pi. This package includes extensions for workflow planning, browser integration, background processes, persistent memory, todo tracking, search, subagents, UI improvements, and safety.

## Agent-facing tools

| Tool             | Extension      | Purpose                                    |
| ---------------- | -------------- | ------------------------------------------ |
| `browser_bridge` | Browser bridge | Control a connected Chrome/Edge browser.   |
| `cronjob`        | Cronjobs       | Schedule future or recurring agent tasks.  |
| `graph_memory`   | Graph memory   | Persist durable knowledge across sessions. |
| `human_in_loop`  | Human in loop  | Ask for clarification/approval in the TUI. |
| `process`        | Processes      | Manage long-running commands.              |
| `search`         | SearXNG search | Search the web through SearXNG.            |
| `subagent`       | Subagents      | Run bounded specialist agents.             |
| `todo`           | Todo           | Track persistent agent tasks.              |
| `web_terminal`   | Web terminal   | Show web terminal status/setup URLs.       |

## Common slash commands

| Command              | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `/agent`             | Manage custom subagent definitions.            |
| `/browser-bridge`    | Start/show browser bridge setup.               |
| `/caveman`           | Toggle terse English caveman language mode.    |
| `/pet`               | Show or manage the Tamagotchi pet.             |
| `/pick-issue`        | Pick an issue, branch, and create a WIP PR.    |
| `/bootstrap [scope]` | Prompt-template repository bootstrap workflow. |
| `/plan <task>`       | Clarification-first planning workflow.         |
| `/pretty-output`     | Toggle/preview pretty output rendering.        |
| `/review [scope]`    | Prompt-template project/code review workflow.  |
| `/ps`                | Process dashboard.                             |
| `/research <topic>`  | Prompt-template research workflow.             |
| `/to-issue`          | Create GitHub issues from repo/conversation.   |
| `/to-pr`             | Create a GitHub PR from repo/conversation.     |
| `/web-terminal`      | Start/show authenticated web terminal setup.   |
| `/welcome`           | Show the welcome screen.                       |

## Reloading

After editing extensions, run:

```text
/reload
```
