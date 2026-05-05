# Prompts

Prompt templates in `prompts/` become slash commands.

## Included prompts

### `debug.md`

A strategic evidence-first debugging prompt that guides reproduction, hypothesis ranking, localization, root-cause fix, regression coverage, validation, and reporting. Accepts a symptom, failing command, or bug report via `/debug <symptom / failing command / bug report>`.

### `review.md`

A multiagent-style deep technical audit prompt for architecture, backend/API, frontend/UI, security, testing, DevOps, and code quality review. Accepts optional scope, files, PR URL, or focus areas via `/review [scope / files / PR URL / focus areas]`.

Expected output includes an executive summary, risk matrix, concrete findings, GitHub-issue-ready tasks, and recommended implementation order.

### `research.md`

A multiagent-style research prompt for source discovery, technical analysis, security/risk review, alternatives comparison, and implementation planning. Requires a topic/question via `/research <topic or question>`.

Expected output includes sourced findings, confidence levels, risk/tradeoff tables, GitHub-issue-ready tasks, and recommended implementation order.

### `refine-codebase.md`

An architecture refinement prompt based on deepening shallow modules into deeper modules. Accepts optional scope or paths via `/refine-codebase [scope / paths / domain area / focus]`.

Expected output is a numbered list of deepening opportunities using the vocabulary Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality. It asks which candidate to explore before proposing concrete interfaces.

## Usage examples

```text
/debug npm test is failing with a timeout
/review review my current diff
/research compare deployment options for this repo
/refine-codebase extensions/web-terminal
```
