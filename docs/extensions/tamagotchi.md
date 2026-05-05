# Tamagotchi

`extensions/tamagotchi/` adds a persistent TUI pet widget.

## Provides

- Always-visible, boxed pet widget below the editor with hunger/xp progress bars
- Compact footer status
- `/pet`, `/pet name <name>`, and `/pet reset`
- Global cross-session persistent state at `~/.pi/agent/tamagotchi-pet.json`

## Behavior

The pet is shared across pi sessions. It is fed when bug-fix turns make successful edits, with extra XP for verified fixes that run checks or tests.
