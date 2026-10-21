# Changelog

All notable changes to this alpha release are documented here.

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
