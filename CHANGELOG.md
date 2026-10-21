# Changelog

All notable changes to this alpha release are documented here.

## 0.2.0-alpha.2 — 2026-10-21

### Added

- Explicit, separately gated Codex execution adapter with exact B1 model/effort selection, clean-worktree recheck, bounded stdin/JSONL handling, and no raw event output.
- Independent B0/B1 benchmark plan and conservative **token-volume/quality gate** for 30 paired cases.

- Manual advisory candidate selection by percentage of saved total input + output tokens, with cache input counted once.
- Cited research guidance on evaluation, provider-specific cache accounting and benchmark validity.

### Limits

- The execution adapter is disabled by default and has not started a model run.
- No real benchmark usage, independently validated accepted quality corpus, measured token savings, or production authorization is included.

## 0.2.0-alpha.1 — 2026-10-21

### Added

- Passive metadata-only Shadow Mode for explicit JSON and JSONL imports.
- Local interactive task preview and deterministic demo commands.
- Experimental read-only inspector, planning, verification, and benchmark helpers.
- Windows starter, GitHub Actions CI, security policy, ignore rules, and repository attributes.

### Fixed

- A `turn.started` event with a contradictory `status: completed` no longer completes a turn without a terminal turn event.
- Missing failed-attempt evidence remains `null`/`UNKNOWN` instead of being reported as zero.

### Limits

- Active routing, autonomous agent execution, cost/token guarantees, production security guarantees, and independently verified quality optimization remain out of scope.

