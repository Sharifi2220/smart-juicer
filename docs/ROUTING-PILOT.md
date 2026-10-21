# Evidence-gated model routing pilot (v0.3 draft)

Smart Juicer can now **calculate a provisional candidate model recommendation** from user-supplied, paired comparison records. It cannot verify those records, billing costs, account entitlement, or independent acceptance by itself. This is not yet active routing and **does not prove a real savings rate**.

## Run locally

```sh
npm ci
npm test
npm run check
npm run route -- path/to/explicit-routing-evidence.json
```

No network or Codex process is started by the routing command. The JSON file is explicitly named by the operator; its raw task prompt is never echoed to output. File limit: 1 MiB.

### Input shape

```json
{
  "schema_version": "v0.3-route-pilot",
  "task": {
    "schema_version": "v0.1",
    "sourceTrust": "user_direct",
    "originalPrompt": "Change the CSS button color",
    "fileMetadata": {
      "totalCount": 1,
      "extensions": [".css"],
      "changedRelativePaths": ["src/button.css"]
    },
    "repoSignals": {"gitDirty": false, "sensitivePathsTouched": false, "testsPresent": true}
  },
  "candidateModel": "your-account-available-model-id",
  "trials": [
    {
      "fixtureId": "fixture-001",
      "taskClass": "ui",
      "arm": "B0",
      "modelId": null,
      "accepted": true,
      "review": "independent",
      "costEur": 1.0
    },
    {
      "fixtureId": "fixture-001",
      "taskClass": "ui",
      "arm": "B1",
      "modelId": "your-account-available-model-id",
      "accepted": true,
      "review": "independent",
      "costEur": 0.7
    }
  ]
}
```

The above **single pair is deliberately insufficient**. The policy needs at least 30 complete, unique, task-class-matched B0/B1 pairs. B0 uses native Codex defaults, recorded with `modelId:null`. B1 uses one explicit model ID. Every record must claim independent review, both arms must have passed, and all costs must be present. A candidate must show at least a 15% reduction in the supplied cost figures. A single quality regression or unknown cost is enough to decline the candidate.

Those conditions are deliberately conservative but do **not** establish statistically guaranteed savings or provenance. A `review:"independent"` field is not a cryptographic attestation. If data is incomplete, conflicting, unsafe, or below threshold, routing returns `KEEP_NATIVE_DEFAULT` with a machine-readable reason.

The returned `claimedSavingsPercent` is arithmetic over **imported claims**, not a real independently audited saving. `autoExecute:false`, `modelEntitlementVerified:false` and `independentEvidenceAuthenticated:false` are unconditional. The selected candidate, if any, is marked `CANDIDATE_REQUIRES_REVIEW` and has no effect on any Codex config or run.

## Still required before a full automatic engine

1. On a clean, isolated Windows fixture root, verify model entitlement and CLI behavior using explicit account permission and explicit-cost authorization.
2. Run independent, blinded, paired tasks with same prompts, scopes and acceptance criteria in native B0 and candidate B1. Repeat across representative classes. Store metadata only in the private Research Lab, never real prompts in GitHub.
3. Record prices from an applicable billing/tariff source. Subscription-access token counts are **not** automatically an invoice or per-task EUR cost.
4. Enforce host-side execution permissions, symlink/reparse-point and TOCTOU defenses, budget caps, independent quality gates and rollback before allowing an agent to make edits.
5. Only claim measured savings for a dated, documented evaluation with sample size, accepted-task rate, uncertainty, costs and complete run provenance. Do not extrapolate a synthetic test dataset into production ROI.

No synthetic routing fixture or passing unit test can substitute for these prerequisites.

## Explicit execution adapter (not enabled by routing)

The implementation now includes `codex-executor.ts` and the `execute` npm script. The adapter is deliberately not called by `routing-policy.ts`: a B1 run needs an exact operator-supplied model ID and effort, a matching unexpired approval, an explicitly marked isolated clean Git worktree, and `SMART_JUICER_EXECUTE=1`. It invokes `codex exec --json --ephemeral --ignore-user-config` with `--model` only for B1, `--sandbox read-only` or `workspace-write`, and `--ask-for-approval on-request`.

The adapter performs a final read-only scope check immediately before spawning Codex, bounds prompt size, runtime and JSONL output, and never places the prompt in process arguments or returns raw event text. Provider entitlement and billing are not inferred; `billingCostEur` remains `null`. No test or smoke command enables the execution opt-in.



The host must independently set `SMART_JUICER_APPROVED_ROOT` to the canonical linked Git worktree; JSON permission fields alone are never an authorization. The executor checks the separate host env flag, root identity, and Git worktree metadata before spawning. These checks are snapshots and cannot replace process-tree isolation, anti-TOCTOU protections, OS permission enforcement, or secret controls. `budgetEur` is not spent or enforced by provider billing telemetry; separate live spend controls are mandatory before paid pilots. Because the adapter uses `--ignore-user-config`, B0 is a controlled non-interactive CLI baseline, not necessarily the exact settings of normal interactive Codex.
