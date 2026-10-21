# Smart Juicer v0.2.0-alpha.2 — release candidate preparation

## Scope

This candidate adds a separately gated Codex execution adapter and prepares an independent B0/B1 benchmark workflow. The public routing policy remains advisory and cannot invoke the adapter or change a model.

## Safety boundary

Execution is disabled by default. A run requires `SMART_JUICER_EXECUTE=1`, an explicit unexpired approval document, an exact model and effort for B1, a clean isolated Git worktree, a bounded runtime/output budget, and Codex's normal approval flow. The adapter does not bypass approvals, use danger mode, authenticate entitlements, or infer EUR costs from tokens.

## Benchmark boundary

The 30-case plan is prepared but not run. No paid inference, real prompt export, provider billing read, or verified savings claim is included. B0/B1 results remain blocked until separate budget approval, independent acceptance review, and source-labelled token usage and independent quality evidence exist. The efficiency measure is percentage of saved input + output tokens, not EUR prices.

## Verification performed locally

`npm ci`, `npm test`, `npm run check`, observer/route/doctor/plan/shadow/starter smoke tests, and the executor's no-opt-in fail-closed check are required before tagging. GitHub CI and the final release tag must be verified on the resulting commit before publication.



## Post-review security clarifications

The adapter requires a separately host-pinned `SMART_JUICER_APPROVED_ROOT` as well as the explicit execute opt-in, and validates linked Git worktree metadata before spawn. The benchmark gate rejects extra, malformed or unpaired trials and cross-model substitution. This is an experimental pre-release: **budgetEur does not cap real provider spend**, no host sandbox has been certified, and no real inference or savings result is available. Merge and tag remain subject to human review.
