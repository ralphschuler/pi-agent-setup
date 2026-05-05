# Tamagotchi

`extensions/tamagotchi/` adds a persistent TUI pet widget.

## Provides

- Always-visible, clean outlined pet widget below the editor with hunger/xp progress bars, evolution stage, streak, and truncated last-meal text
- Compact footer status with level, stage, and mood
- `/pet`, `/pet stats`, `/pet achievements`, `/pet mood`, `/pet name <name>`, and `/pet reset`
- Global cross-session persistent state at `~/.pi/agent/tamagotchi-pet.json`
- Versioned state with safer temp-file writes

## Behavior

The pet is shared across pi sessions. It is fed when bug-fix turns make successful edits, with extra XP for verified fixes that run checks or tests.

Additional reward paths detect test-file and documentation edits. The pet tracks streaks, best streak, achievements, and computed evolution stages:

- `hatchling` — levels 1-4
- `junior` — levels 5-9
- `hacker` — levels 10-19
- `daemon` — level 20+
