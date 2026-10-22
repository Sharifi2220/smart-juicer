# v0.6 pilot integration and safety status

This change provides a **local offline evaluation data contract**, not a complete live A/B runner. See [CONCEPT-V3.md](CONCEPT-V3.md).

## Components

- `pilot-contract.ts`: pre-registered task manifest, SHA-256, complete assignment outcome states, source-specific non-double-counting usage adapters, fail-closed journal replay and cohort report. All imported quality labels are **UNVERIFIED** by this module.
- `pilot-journal.ts`: host-owned, external, append-only JSONL event journal; exclusive `.lock`, synchronous writes and OS `fsync` before returning, full chain readback. There is **no automatic torn-record recovery**. A crash can leave `.lock`; inspect files and running processes before manual removal. On a corrupted tail, stop; do not silently trim or skip events.
- `pilot-scope.ts`: advisory `realpathSync.native()` + `path.relative` containment and basic symlink/hardlink checks. **Not** an OS sandbox; not a guarantee against TOCTOU, Windows junction subtleties or host privilege escalation.
- `codex-executor.ts`: ordinary B0 still prohibits model overrides. Experimental B0 `medium` and B1 `low` may name the same explicit model only with matching operator approval and an independently host-pinned manifest digest.

## Trust boundary

Runtime journal location must be controlled by the host OS outside the agent worktree, preferably a local unsynchronized disk path (not Google Drive Desktop). `SMART_JUICER_PILOT_MANIFEST_SHA256` must be assigned by an independent trusted launcher; neither prompts, fixtures, request JSON nor a `.env` in an agent-editable repo can authorize execution. Journal operations require a matching host-provided environment value by default. OS permissions must prevent untrusted agent processes from rewriting manifest, journal, hidden tests or verifier. Check for leftover `.lock` and integrity failures manually before restart.

`fsync` does not make a JSONL append or an entire job magically atomic. Filesystems, devices, host crashes and cloud-sync interactions can still leave incomplete or stale records. The module fails closed instead of inferring lost token values as zero. Persist `running` before invoking a model; if the process disappears, `running` remains unaccepted and missing consumption blocks claims. The real runner must implement process lifecycle, timeouts and crash recovery.

## Metrics

Every registered task contributes once to B0 and B1's success denominator. Successful verifier result requires independent evidence and mutation kills; the module only validates the *shape of imported evidence*, not authenticity. All token fields are non-negative safe integers. Input+output includes cached input and reasoning output respectively. Missing run usage blocks all-cohort token savings. A small raw token total is **not** evidence of non-inferior performance, especially when tasks fail early. Quality and efficiency are reported as separate metrics; 30 pairs are pilot data only.

## Build and integration

Use exact baseline GitHub commit `42b865dcdde01881d9107449e0d23faf7cea966c` for review. **Do not use the earlier `--unidiff-zero` patch**. Apply the accompanying standard context-bearing patch only to a clean, verified revision after:

```sh
git rev-parse HEAD
git status --short
git apply --check --verbose smart-juicer-v0.6-hardened.patch
git apply smart-juicer-v0.6-hardened.patch
npm ci
npm test
npm run check
```

Run full Node 24 Windows and Ubuntu GitHub CI and a disposable local Windows host gate before approving a merge. Separate user authorization is required for any inference, paid execution or changes to native Codex account settings.

**Incomplete:** 30 authenticated real fixtures, independent hidden mutation runner, actual Codex JSONL integration/readback, secure OS/container runner, model entitlement check, hard provider spend cap, crash-safe replay strategy, real 60-run data, and cross-platform Node 24 CI verification. No automatic routing or savings guarantee.

## V4 reconciliation – 22 October 2026 (unreleased)

See [CONCEPT-V4.md](CONCEPT-V4.md) and [TASK-CORPUS-V4.md](TASK-CORPUS-V4.md). New offline functionality: independent 2×2 outcome counts; non-additive OpenAI vs additive Claude cache accounting; Codex completed-turn usage only (failed/timeout may remain UNKNOWN); best-effort POSIX process-group/Windows `taskkill /T /F` teardown; POSIX directory-entry `fsync`; bounded Windows journal-lock release retries. The test corpus, external verifier, host Job Object/sandbox, hard billing cap, actual 60 runs and Node 24 Windows/Linux CI are **not** implemented or evidenced. No paid inference or auto-routing is allowed based on this local dossier alone.
