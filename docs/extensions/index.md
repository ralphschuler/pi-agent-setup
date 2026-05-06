# Extensions

Extensions are TypeScript modules that customize pi. This package includes extensions for workflow planning, browser integration, background processes, persistent memory, todo tracking, search, subagents, UI improvements, and safety. Use [`Resource rules`](../resource-rules.md) when creating or changing extension commands, tools, or custom subagents.

Workflow slash commands are documented here for discoverability and in [`Prompts`](../prompts.md) for prompt-template behavior. GitHub handoff commands also have compatibility notes in [`GitHub handoff`](github-handoff.md), and the rebase merge workflow is detailed in [`GitHub merge`](github-merge.md).

## Agent-facing tools

| Tool                  | Extension      | Purpose                                      |
| --------------------- | -------------- | -------------------------------------------- |
| `browser_bridge`      | Browser bridge | Control a connected Chrome/Edge browser.     |
| `cronjob`             | Cronjobs       | Schedule future or recurring agent tasks.    |
| `evolve`              | Evolve         | Archive, compare, and restore file variants. |
| `graph_memory`        | Graph memory   | Persist durable knowledge across sessions.   |
| `github_rebase_merge` | GitHub merge   | Wait for checks and rebase-merge PRs.        |
| `human_in_loop`       | Human in loop  | Ask for clarification/approval in the TUI.   |
| `package_scout`       | Package scout  | Audit npm package metadata without install.  |
| `process`             | Processes      | Manage long-running commands.                |
| `search`              | SearXNG search | Search the web through SearXNG.              |
| `searxng_status`      | SearXNG status | Check SearXNG health and setup steps.        |
| `subagent`            | Subagents      | Run bounded specialist agents.               |
| `todo`                | Todo           | Track persistent agent tasks.                |
| `web_terminal`        | Web terminal   | Show web terminal status/setup URLs.         |

## Common slash commands

| Command             | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `/agent`            | Manage custom subagent definitions.           |
| `/browser-bridge`   | Start/show browser bridge setup.              |
| `/caveman`          | Toggle terse English caveman language mode.   |
| `/debug`            | Prompt-template strategic debugging workflow. |
| `/darwin`           | Queue bounded evolve iteration workflow.      |
| `/evolve`           | Manage local file variant archive workflows.  |
| `/merge`            | Prompt-template safe PR rebase merge flow.    |
| `/mutate`           | Queue safe file variant generation workflow.  |
| `/package-scout`    | Audit npm package metadata without install.   |
| `/pet`              | Show or manage the Tamagotchi pet.            |
| `/pick-issue`       | Prompt-template issue pickup and WIP PR flow. |
| `/plan <task>`      | Clarification-first planning workflow.        |
| `/pretty-output`    | Toggle/preview pretty output rendering.       |
| `/refine-codebase`  | Prompt-template architecture refinement.      |
| `/review [scope]`   | Prompt-template project/code review workflow. |
| `/standup`          | Prompt-template repo standup summary flow.    |
| `/ps`               | Process dashboard.                            |
| `/research <topic>` | Prompt-template research workflow.            |
| `/searxng`          | Show SearXNG status/setup help.               |
| `/to-issue`         | Prompt-template GitHub issue creation flow.   |
| `/to-pr`            | Prompt-template GitHub PR creation flow.      |
| `/web-terminal`     | Start/show authenticated web terminal setup.  |
| `/welcome`          | Show the welcome screen.                      |

## Reloading

After editing extensions, run:

```text
/reload
```
