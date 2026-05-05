# Tamagotchi

`extensions/tamagotchi/` adds a persistent TUI pet widget.

## Provides

- Always-visible pet widget below the editor
- Compact footer status
- `/pet`, `/pet name <name>`, and `/pet reset`
- Persistent state at `~/.pi/agent/tamagotchi-pet.json`

## Behavior

The pet is fed when bug-fix turns make successful edits, with extra XP for verified fixes that run checks or tests.
