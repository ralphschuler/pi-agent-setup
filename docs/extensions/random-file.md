# Random file tool

`random_file` samples unbiased Git-tracked safe text files from the current repository and returns bounded snippets. Use it when review, refine-codebase, or discovery work should not start from a search term.

## Behavior

- Uses `git ls-files` as the candidate set.
- Skips protected secret paths such as `.env`, credentials, and private keys.
- Skips binary files and large files.
- Returns paths, file sizes, and bounded snippets, not full contents.
- Supports optional `seed` for reproducible samples.
- Defaults to 5 files and caps `amount` at 50.

## Parameters

| Parameter      | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `amount`       | Number of files to sample. Default `5`, max `50`.              |
| `seed`         | Optional `seed` to reproduce a previous sample.                |
| `path`         | Optional repo-relative path/prefix filter.                     |
| `glob`         | Optional simple glob filter, such as `**/*.ts` or `docs/*.md`. |
| `snippetLines` | Snippet lines per file. Default `20`, max `80`.                |

## Typical use

1. Call `random_file` with a small `amount`.
2. Review returned snippets for interesting files or improvement opportunities.
3. Use `read` on selected paths that need deeper inspection.
4. Reuse the returned `seed` when a sample must be reproduced in follow-up work.

## Safety and rollback

The tool is read-only and does not sample untracked files. Rollback/stop point: disable the `random_file` tool registration or remove `extensions/random-file/` if unbiased sampling is not desired.
