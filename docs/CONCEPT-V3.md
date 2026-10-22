# Smart Juicer V3 — Coding-Agent Efficiency & Quality Lab

**Status:** Architecture and offline prototype. This document describes the *target product*, not a completed live-agent pilot, performance guarantee, formal security certification, or customer validation.

## 1. Decision

Smart Juicer is a **local-first, reproducible evaluation harness** for comparing coding-agent configurations on tasks from the same task cohort. It should measure the full task success rate and associated tokens, time, retries and, where verified, provider-billed spend. The first experiment tests *the same Codex model* at different reasoning-effort levels. Automatic live model choice is explicitly deferred.

The first credible deliverable is not a router or general-purpose observability dashboard. It is a **signed-off measurement report** that can be reproduced and audited by another engineer. Routing may consume the evidence later, but the pilot does not authorize routing.

## 2. User, problem and alternatives

Initial users: engineering leads and developers using repetitive coding-agent workflows with identifiable acceptance tests. They need to know whether default or higher reasoning effort is justified *on their own code and fixtures*. Flat subscriptions may not decrease the monthly invoice when tokens drop; benefits may instead be throughput, quota headroom or faster completion. API metered usage may have direct cost implications only when rates and invoices are verifiable.

Competitors already provide coding-agent evaluations, sandboxes, traces and dashboards. For example, Promptfoo documents Codex coding-agent evaluation with assertions, repeat runs and sandbox controls. A unique market position for Smart Juicer has **not** been demonstrated. The proposed specialization is a small, transparent, local same-model effort audit with explicit cohort coverage, independent mutation oracles, verifiable usage and a clear UNKNOWN state.

## 3. Bounded pilot

- **Task class:** generate missing unit tests for deterministic TypeScript functions, with three pre-declared complexity strata (10 easy; 10 edge-case; 10 branch/state-rich).
- **Tasks:** 30 independently identified tasks, 60 assigned runs (B0 and B1 for each task). Not 30 observed successful records.
- **Model:** pre-specified exact `gpt-6.1-sol` identifier only if the target Codex account and CLI actually support it; otherwise pause and revise the manifest *before* starting, rather than silently substitute.
- **B0:** `medium`, **B1:** `low`; same explicit model, CLI version, container image digest, exact prompt, fixture commit and verification rules.
- **Randomization:** pre-seeded order of B0/B1 within each pair to reduce systematic order/caching drift; no shared agent session or modified worktree.
- **Runs:** fresh clean, isolated worktree created from the corresponding fixed fixture, controlled network and credentials, bounded wall-clock and spend. Agent tools may edit only permitted test paths. The immutable hidden evaluator is not mounted writable into the agent environment.
- **Acceptance:** unmodified production code; clean type-check; nontrivial tests; predetermined assertions; independent, hidden mutant-kill suite; no `skip`, `todo`, dishonest tests or modifications to protected files. A green `npm test` by itself does *not* establish quality.
- **Disclosure:** cache cold/warm protocol, model availability, task construction and exclusions, versions, ordering seed, full set of terminal/missing statuses and usage provenance.

**Pilot N=30 is exploratory**, not adequate to establish tight quality non-inferiority or a universal 15–25% saving. If paired outcomes are promising, pre-register a larger confirmatory sample and a non-inferiority margin based on actual task risks and observed variance, not a stock n=80/120 estimate.

## 4. Evidence architecture

The offline `pilot-contract.ts` defines the manifest, a SHA-256 digest over a normalized manifest, hash-chained event validation, source-specific usage normalizers, and a full-assignment report. `pilot-journal.ts` creates an external JSONL journal before execution and writes events synchronously with `fsync`; a fail-closed lock prevents concurrent writers, with manual recovery after a crash. `pilot-scope.ts` provides only advisory canonical containment checks, **not** OS sandboxing.

The journal must be stored in a **host-controlled, nonsynchronized runtime directory outside any agent workspace and outside the Google Drive Desktop synced worktree**. Google Drive remains the master *documentation and approved artifact archive*, not the runtime journal or mutable Git object store. Copy a redacted completed report and checksum into the existing project topic folder at the end. Avoid maintaining a second canonical project tree.

`SMART_JUICER_PILOT_MANIFEST_SHA256` must come from a trusted process or operator outside the agent-controlled JSON, prompt and repository. A digest and local filesystem controls support tamper detection against accidental edits; they are not a signature, a guarantee against a malicious same-user process, or evidence that provider usage is genuine. Raw model event streams need source validation.

Persistent event states: `pending` (pre-registered slot), `running`, `completed`, `failed`, `timeout`, `crashed`. Missing or half-written events must **never** be silently filtered out. A partial journal record blocks evaluation until inspected; `fsync` reduces buffering-loss risk but does not make multi-write JSONL records transactionally atomic or guarantee recovery from power loss. Explicit crash recovery, locking, backup and retention procedures require Windows and Linux tests.

## 5. Measurement contract

For each task i and arm a, let `S_ia = 1` only when the external immutable evaluator accepts the outcome; otherwise `0` (including timeouts, crashes and unstarted slots). Let `U_ia` be full verified token usage for every invocation/retry and overhead attributable to that assignment. `U_ia` is **UNKNOWN** if any component is missing, never 0 by default.

**Quality metric** per arm:

`success_rate_a = sum_i S_ia / N` for all N pre-registered tasks.

**Efficiency metrics**, reported separately:

`tokens_per_success_a = sum_i U_ia / sum_i S_ia` only if *all* assigned runs have verified usage and there is at least one success; if no successful tasks, mark `undefined/no successes` (conceptually infinite). Always report the success rate next to this ratio.

`raw_token_savings_pct = 100 × (1 - sum_i U_i,B1 / sum_i U_i,B0)` only if both sums are complete, finite and baseline > 0. A failed run that stops early can show raw token savings despite degrading quality; **never** treat savings alone as a pass.

`success_difference = success_rate_B1 - success_rate_B0`; report pair discordances (B0-only and B1-only success), not just separate confidence intervals. Report paired uncertainty appropriately; a nonsignificant McNemar result does not show equivalence or non-inferiority. Secondary: wall time, p50/p95 latency, billed EUR only with verified applicable rates, retry counts, human review time and percentage of missing usage.

Do **not** combine tokens and seconds using arbitrary weights. If a client needs a scalar utility, pre-register monetary or time weights, units and sensitivity analysis. In particular, avoid `T = input + output + reasoning`: reasoning output tokens are already counted in output, and cached input tokens are already counted in input. Chat Completions use `prompt_tokens + completion_tokens`; Responses use `input_tokens + output_tokens`. A Codex JSONL stream requires a separately versioned per-turn parser, not summing every cumulative update.

## 6. Security and trust boundaries

Source- and results-level hashing is not a sandbox. Worktrees and realpath/relative checks are advisory; the actual agent needs an OS/container boundary with restricted filesystem, network, process tree and credentials. An agent with shell access can otherwise observe secrets or escape nominal workspace boundaries. Use trusted fixtures with dependencies resolved before disabling network, or an explicit network allowlist. Avoid running Git or highly concurrent runtime journals in the active Google Drive sync folder. `EBUSY`/`EPERM`, reparse point aliases and sync races should be tested on the actual Windows host; no universal error-frequency claim is made.

An independent verifier must run on a trusted pristine copy of the fixture and hidden oracles. Do not allow the agent to change acceptance rules, mutation lists, verifier binaries or input manifest. Set model/effort only for the designated pilot; normal B0 behavior remains unchanged. Explicit operator action, hard budget control, audited model entitlement and kill-switch are prerequisites for paid runs.

## 7. Build and rollout gates

1. **Offline integrity:** all existing tests + adversarial tests, full TypeScript check on Node 24 Windows and Linux, journal corruption/recovery checks and no unexpected network or inference calls.
2. **Host integration:** runner writes external journal before spawn, verifies pinned manifest, records every assigned run, pins the full CLI/model/config, reports failed tasks and guards process tree/network, independently executes hidden evaluator.
3. **Real pilot:** 30 preregistered paired tasks and a complete readback, including missing usage counts. Report observed differences and uncertainty, not a formal non-inferiority claim.
4. **Confirmatory test:** larger task set and predeclared non-inferiority bound after pilot variance measurement; holdout fixtures, repeatability and developer review.
5. **Distribution/business:** publish a reproducible privacy-safe example, run qualified interviews with real teams, compare against existing Codex defaults and Promptfoo, offer audits only if value is demonstrated.
6. **Opt-in optimization:** consider guarded active switching only after evidential and safety gates. No default auto-routing, no expansion to SQL/SaaS/energy products yet.

## 8. Current verified limits

The baseline public code at `42b865dcdde01881d9107449e0d23faf7cea966c` is a prototype; previous prerelease `v0.2.0-alpha.2` is not a complete experiment harness. New v0.6 code provides an offline experiment *data contract*, durable journal *primitive*, advisory scope guard and opt-in same-model B0/B1 pinning. The full trusted orchestrator, real provider usage importer, independent mutation-verifier executable, OS sandbox, crash recovery and real 30-task corpus remain outstanding; no real token savings or customer demand have been demonstrated.

## 9. Independent sources and methodological anchors

- OpenAI token accounting: https://developers.openai.com/api/docs/guides/token-counting
- OpenAI generated SDK usage shapes: https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_usage.py
- Codex CLI options and reproducibility: https://learn.chatgpt.com/docs/cli/reference
- Coding agent eval competitor: https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
- Paired binary tests and non-significance caveat: https://www.ncbi.nlm.nih.gov/books/NBK560699/
- Git context-free patch warning: https://git-scm.com/docs/git-apply
- Node 24 fs.appendFileSync/fsync behavior: https://r2.nodejs.org/docs/latest-v24.x/api/fs.html
- METR agent-productivity methodological warning: https://metr.org/blog/2026-02-24-uplift-update/
- Model availability reference: https://developers.openai.com/api/docs/models/gpt-6.1-sol

These are published technical references, not expert endorsements, formal audits of this repository, or evidence of project sales.
