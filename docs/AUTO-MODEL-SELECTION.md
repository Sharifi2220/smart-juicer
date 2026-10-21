# Automatic model selection: offline planner, not autonomous execution

Status: **EXPERIMENTAL / NONEXECUTING**. This design describes a safe, stepwise path to future automatic model choice. The current `auto-model-plan.ts` can choose a candidate **in its result JSON only** from evidence signed by an explicitly host-pinned issuer. It cannot start Codex, change the user's active model, alter settings, write repositories, or grant execution rights.

## Recommended decision process

1. **Classify the task conservatively.** Reuse the existing observer's risk and domain classification. Multiple domains, unverified scope, or risk other than `GUARDED` means keep the native Codex default.
2. **Restrict candidate models by host policy.** Never accept account entitlement or model availability as an instruction from imported JSON. The exact candidate ID must be on a host-provided allowlist. Model entitlement is still reported `false` because local policy cannot validate the connected account.
3. **Authenticate provenance.** Require an Ed25519 signature over the *exact UTF-8 bytes* represented in `payloadBase64`. Supply the trusted public key separately via the host, not inside the purported evidence. Reject alterations, invalid signatures, expired artifacts, or evidence for another repository commit/task class. **Authenticating a signing key does not prove that the signer performed an unbiased quality review or measured true provider usage.**
4. **Gate quality before efficiency.** Reuse `assessIndependentB0B1`: at least 30 matched accepted B0/B1 trials *within the same task class*, complete source-labelled token usage, consistent model and fixture IDs, no invalid or extra records, >=15% claimed aggregate token reduction. Imported quality labels remain unverified claims.
5. **Protect against cohort imbalance.** Additional initial pilot policy: >=80% of pairs must use **no more total tokens** under the candidate than under B0. This is a project-chosen precaution, not a research-backed optimum. Tune only with representative data; avoid using an arbitrary threshold as a universal production guarantee.
6. **Fail closed.** Absent or expired signatures, absent allowlist, mismatched Git revision, bad token accounting, no quality proof, risky tasks, or unavailable model -> `KEEP_NATIVE_DEFAULT`; never try to reinterpret prompts or guess a model.
7. **Separate planning from execution.** `AUTO_SELECT_CANDIDATE_PLAN` only supplies metadata for a **future human-reviewed choice**. No connection to `codex-executor.ts` or `routing-cli.ts`. It unconditionally returns `autoExecute:false` and `modelEntitlementVerified:false`. Execution requires an independent host authorization system and separately approved real-agent tests.

## Offline invocation (no inference)

```sh
npm ci
npm test
npm run check
npm run auto-plan -- path/to/local-request.json
```

The request JSON supplies **only** `task` and `evidence: {payloadBase64, signatureBase64}`. It should never be committed if it contains real task context. The host provides these *out of band* environment settings:

- `SMART_JUICER_ROUTER_TRUSTED_KEY_PATH`: path to trusted **public** Ed25519 PEM file, explicitly provisioned by the operator, max 4 KiB. Never include private keys.
- `SMART_JUICER_ROUTER_MODELS`: comma-separated host allowlisted model IDs, e.g. `candidate-1`.
- `SMART_JUICER_ROUTER_COMMIT`: exact full 40-character repository commit ID for the benchmark/task fixture.

Without any of these, the result is a native-default decision. The CLI never emits the task prompt or trial records. The host environment is a configuration source, **not an authenticated provider entitlement or an independent execution authorization**.

### Signed payload

The UTF-8 JSON bytes represented in `payloadBase64` follow `v0.1-signed-evidence`:

```json
{
  "schema_version": "v0.1-signed-evidence",
  "candidateModel": "candidate-1",
  "candidateEffort": "low",
  "taskClass": "ui",
  "repositoryCommit": "0123456789abcdef0123456789abcdef01234567",
  "generatedAt": "2026-10-21T09:00:00Z",
  "expiresAt": "2026-10-22T09:00:00Z",
  "trials": []
}
```

An empty trial array **cannot qualify**. Actual evidence must include 30 accepted and complete B0/B1 pairs using the existing `v0.5-token-gate` trial fields. Sign the exact serialized bytes using Ed25519; *any re-serialization requires re-signing*. A trusted security/evaluation issuer should only sign records after independently checking acceptance and real usage provenance, although the current planner itself cannot verify that review was legitimate.


For a fully synthetic, reproducible smoke demonstration (no model call), run `npm run auto-plan-demo`. The self-signed demo key proves only that signature verification works; it must never be used as evidence of independent real-world acceptance or token savings.

## Why not route immediately?

RouteLLM (Berkeley/LMSYS) shows how routing policies can be trained from preference evidence and emphasizes calibration on representative tasks. FrugalGPT studies staged routing/cascades. Neither study establishes that a particular model saves **tokens** on this repository, nor that cost savings imply token-volume reductions. HELM encourages multidimensional comparison. OWASP guidance requires least privilege and human approval for high-impact actions. Therefore Smart Juicer starts with deterministic, testable, nonexecuting decisions and future shadow-mode evaluation.

## Future acceptance stages

| Phase | Proof required | Permitted action |
| --- | --- | --- |
| A: passive observation | Metadata only | No model choice |
| B: synthetic planner | Unit/CI passes | Offline plans only |
| C: signed, independently audited comparison | Real complete token provenance and separate blinded quality review | Manual candidate recommendation |
| D: guarded live pilot | Host entitlement, OS isolation, spending cap, rollback, drift checks, explicit operator approval | Limited, separately authorized model execution |
| E: opt-in automated routing | Repeatable per-class field quality, calibrated confidence/thresholds, continuous monitoring, halt switch and rollback | Only narrowly-scoped, revocable auto-selection |

No stage automatically authorizes the following stage. Real prompts, access tokens, model keys and private repository content must stay outside the public project source.

## Public research references

- UC Berkeley / LMSYS, RouteLLM research and calibration: https://sky.cs.berkeley.edu/project/routellm/ and https://github.com/lm-sys/RouteLLM
- Chen, Zaharia, Zou, *FrugalGPT*, https://arxiv.org/abs/2305.05176
- Stanford CRFM, *HELM*, https://github.com/stanford-crfm/helm
- OpenAI, *Model selection*, https://developers.openai.com/api/docs/guides/model-selection
- OWASP, *LLM Top 10 2025*, https://owasp.org/www-project-top-10-for-large-language-model-applications/
- [Existing research and evaluation notes](RESEARCH-AND-EVALUATION.md)

All cited organizations and authors are **independent literature sources**, not Smart Juicer collaborators or endorsers.
