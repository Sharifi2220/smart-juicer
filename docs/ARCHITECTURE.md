# Architecture

## Scope

Smart Juicer v0.2.0-alpha.2 implements a passive local observer and explicitly imported token metadata analyzer plus an independently gated and default-disabled Codex execution adapter. The public source tree contains:

- `observer.ts`: deterministic task classification from validated v0.1 JSON input; emits risk, domain, reason codes, and conservative nonexecuting guidance, not model decisions.
- `cli.ts`: bounded JSON-over-stdin entry point for the observer; one JSON result on stdout.
- `sj-local.ts` and `Smart-Juicer-Start.cmd`: local interactive and demo entry points; no agent execution.
- `shadow-mode.ts`: explicit JSON or JSONL input parsing and metadata-only summarization; usage may be unknown and live sessions are never searched.
- `inspector.ts` and `path-policy.ts`: read-only Git and filesystem-scope diagnostics. These are snapshots, not an authorization boundary or TOCTOU guarantee.
- `codex-wrapper.ts`: diagnostic version check and nonexecuting Codex run-plan construction; it never invokes inference.
- `codex-executor.ts` and `codex-exec-cli.ts`: a separate, opt-in execution adapter. It requires a fresh explicit approval, an exact model for B1, a clean isolated worktree, a bounded prompt/time/output budget, and Codex's read-only or workspace-write sandbox. It passes no prompt in argv, ignores the global config for the invocation, and returns usage metadata without billing claims.
- `quality-verifier.ts`: allowlist, sensitive-path, and optional Git diff checks; it does not independently establish successful completion.
- `benchmark.ts`: deterministic aggregation of externally supplied trials; values alone do not constitute independent quality or authenticated token usage evidence.
- `sj-dev-cli.ts`: development diagnostic command wrapper.

## Trust boundaries

1. User text, imported JSON, and JSONL events are untrusted.
2. Model, token, effort, outcome, and quality claims in imported records remain reported metadata, not provider-verified or independently accepted results.
3. Local Git/filesystem inspections are advisory snapshots subject to races and filesystem-specific behavior.
4. The routing policy does not grant execution. The execution adapter is a separate capability that remains disabled unless `SMART_JUICER_EXECUTE=1` and a matching explicit approval document are supplied.
5. Standard local preview and offline fixture tests require no network, API expenditure, or model invocation. Running an external tool against a user repository is a separate deliberate action.

## Non-goals

There is no autonomous model routing, session discovery, credential collection, automatic model switch, guaranteed savings, or formal production security certification. The adapter is an explicit integration point, not a production sandbox; TOCTOU, host policy, provider entitlement and billing remain independently gated. G1 and G2 remain open.

## Future acceptance prerequisites

An execution-capable version would require a separate host-enforced least-privilege authorization boundary, robust filesystem and sandbox protections, independent quality verification, explicit cost controls, and paired baseline comparison. Passing the current unit tests must not be interpreted as evidence of those results.



Executor scope correction: `SMART_JUICER_EXECUTE=1` **and** host-supplied `SMART_JUICER_APPROVED_ROOT` are mandatory in the executor itself, distinct from JSON approval claims. The selected root must be a genuine linked Git worktree. This still does not enforce an EUR spending cap or establish an OS-level containment boundary; `budgetEur` is metadata only. Do not call the adapter production-safe or execute paid inference before host-side enforcement and explicit budget approval.

## Automatic model selection planning

The optional offline planner authenticates the issuer signature, checks host-provided policy and quality/usage evidence, then returns a nonexecuting recommendation. It is disconnected from Codex execution and cannot authorize repository writes. Refer to [selection design](AUTO-MODEL-SELECTION.md) and [review roles](EXPERT-REVIEW-TEAM.md).
