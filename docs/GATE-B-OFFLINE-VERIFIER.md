# Gate B — offline mutation evidence

**Status 2026-10-22:** Three synthetic fixtures, Stryker report parser and negative tests are implemented. No actual Stryker engine was installed or executed for this change, no provider tokens or quality non-inferiority have been measured, and there is no independent host security approval.

## Trusted host boundary and security
- The trusted host owns the immutable task manifest, independent agent/verifier workspaces, process lifecycle, pinned Stryker version, anchored evidence, network restrictions and host-owned append-only journal.
- Agent-writable tests must remain separate from hidden verification sources. Source code and mutation criteria belong to a verifier-only workspace. Never accept a JSON claim or a local path alone as independent quality assurance.
- No live agent execution, provider billing, security certification or autonomous model selection is enabled by these offline preparation files.

## Synthetic fixtures
- `fixtures/gate-b/task-01-simple`: amount boundary (below, equal, above) and invalid values.
- `fixtures/gate-b/task-02-edge`: null/non-string, whitespace, Unicode and casing.
- `fixtures/gate-b/task-03-branch`: small state machine and invalid transitions.

These are **public** demonstrations, not real hidden acceptance tests. The Gemini proposal's 2/3/4 exact mutants is **unverified**: the chosen pinned Stryker version and mutator configuration determine the actual number. The real holdout fixtures and their verifier are host-protected and must not be added to the public repository.

## Independent offline Stryker spike (host Codex handoff)
1. Confirm the repository's current source Git SHA, approved writable scopes, Node 24 and clean isolated worktree. Do not alter original releases or unreviewed main.
2. Use a separate unsynchronized **verifier-only** worktree. Pin a tested compatible `@stryker-mutator/core` version there via exact lockfile and vulnerability/license scan. Do not add it to Smart Juicer's npm runtime before a successful isolated spike.
3. Run `node --test candidate.test.mjs` on the unchanged subject first; require exit 0, 0 skips. Copy `fixtures/gate-b/stryker.config.example.json` as `stryker.config.json` into this fixture-specific verifier directory. It explicitly sets command runner, `node --test candidate.test.mjs`, `coverageAnalysis: off`, one mutable subject, the JSON reporter, concurrency 1 and `inPlace: false`.
4. Run the **real pinned Stryker executable** with measured bounded timeout/process-tree management. Read `reports/mutation/mutation.json`, verify the report's source text against the host's unmodified subject SHA-256, record tool version, test-source SHA, exit status, report SHA, duration, and mutation count. No simulated scores.
5. `assessStrykerReport(raw,{sourcePath,sourceSha256,requiredMutationKills,expectedMutationCount})` parses `files[relativePath].mutants[].status` from the official mutation-testing-elements JSON schema; *only* `Killed` counts. Extra/missing files, duplicate mutants, schema failures, source-byte mismatch, unregistered count, `Survived`, `NoCoverage`, `Timeout`, `CompileError`, `RuntimeError`, `Ignored` or `Pending` fail closed. `expectedMutationCount` and the required kills must be pinned **before** the candidate run, not chosen after a favorable result.
6. The parser **always** returns `evidenceTrust: IMPORTED_UNVERIFIED`. It must never set an authoritative `PilotVerifier.accepted` from an untrusted JSON document; only independent host-observed execution and source/test/report readback permit that mapping.
7. Register **six** B0/B1 slots for the three tasks and test controller reporting with deterministic **offline synthetic events** (including missing/failed/timeout slots and UNKNOWN usage). A trivial `assert.ok(true)` test must be rejected for lacking mutation kills; corrupt/duplicate/reordered journal entries and fake verifier evidence must be rejected. Do not invoke paid Codex inference.
8. Run cross-platform **Node 24 Windows/Ubuntu CI**, mark PASS/FAIL/SKIP separately, keep actual Stryker JSON artifacts private, and only then review a follow-up merge.

## Deferred changes and scientific bounds
- The existing v0.6 journal hashes insertion-ordered `JSON.stringify`; reordering imported keys must fail. Any new canonical JSON format requires a **versioned migration**, not a silent hash change.
- Do not swallow POSIX/macOS directory `fsync` EINVAL/ENOTSUP without an explicit durability degradation and platform-specific negative test. Linux/Windows remain the initial supported CI targets.
- N=30 pairs is exploratory: a single discordant pair changes the observed acceptance difference by 3.33pp. No generic 150–250 power promise or 2pp non-inferiority conclusion is justified; pre-register the margin and calculate confirmation power using real pilot discordance.
- Token-volume reduction is not equivalent to credits, invoices or cost. Authentication, provider usage, model entitlement, hard budget caps, sandbox and paid live runs remain separately gated.

Sources:
- https://stryker-mutator.io/docs/stryker-js/configuration/
- https://github.com/stryker-mutator/mutation-testing-elements/blob/master/packages/report-schema/src/mutation-testing-report-schema.json
