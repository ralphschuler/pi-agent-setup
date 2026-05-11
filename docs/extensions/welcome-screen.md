# Welcome screen

`extensions/welcome-screen/` shows a neofetch-style pi agent welcome card.

## Provides

- Startup/reload welcome display
- `/welcome` command
- `/welcome compact` and `/welcome full` detail modes
- Theme-aware, width-safe presentation

## Purpose

The welcome screen gives quick visual confirmation that the package is loaded and shows useful session cockpit context.

## Detail modes

- Startup and reload show the compact cockpit.
- `/welcome` and `/welcome compact` show compact session context.
- `/welcome full` adds deeper runtime, session, repository, and tool details.

Compact facts include model, working directory, Git state, context usage, active tool count, thinking level, host, and theme.

Full facts add pi version, session identity, branch entry count, Node.js version, OS, and an expanded active-tool summary.

## Privacy note

The default compact card includes `host` as `username@hostname`, matching the original behavior. Avoid sharing screenshots if that local identity is sensitive.
