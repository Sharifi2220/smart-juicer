# Changelog

All notable changes to this alpha release are documented here.


## Unreleased V4 offline evaluation hardening (not tagged, not committed)

- Add paired 2×2 outcome counts (no inferential non-inferiority claim), correct Anthropic cache input accounting, and Codex completed-turn-only token evidence.
- Strengthen journal durability semantics with POSIX parent directory flush and bounded lock release retries; process-tree termination remains best-effort, not an OS sandbox.
- Add explicit mutation-test task-corpus design and V4 constraints; no real data, independent security review or provider authorization.

## Unreleased main-only development

- Experimental signed-evidence offline automatic model selection planning with strict native fallback; no live agent invocation, no automatic configuration change.
- Proposed expert review roles and research-based validation criteria, plus synthetic CLI demo and regression tests.

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

