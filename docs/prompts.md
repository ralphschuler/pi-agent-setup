# Prompts

Prompt templates in `prompts/` become slash commands.

## Included prompts

### `review.md`

A multiagent-style deep technical audit prompt for architecture, backend/API, frontend/UI, security, testing, DevOps, and code quality review. Accepts optional scope, files, PR URL, or focus areas via `/review [scope / files / PR URL / focus areas]`.

Expected output includes an executive summary, risk matrix, concrete findings, GitHub-issue-ready tasks, and recommended implementation order.

### `research.md`

A multiagent-style research prompt for source discovery, technical analysis, security/risk review, alternatives comparison, and implementation planning. Requires a topic/question via `/research <topic or question>`.

Expected output includes sourced findings, confidence levels, risk/tradeoff tables, GitHub-issue-ready tasks, and recommended implementation order.

## Usage examples

```text
/review review my current diff
/research compare deployment options for this repo
```
