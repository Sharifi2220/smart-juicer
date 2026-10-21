# Independent B0/B1 benchmark preparation

This repository contains only the neutral benchmark plan. It does not contain real prompts, private repositories, account identifiers, provider logs, or billing exports.

## Arms

- **B0**: native Codex defaults. Do not pass a model or effort override.
- **B1**: one explicitly selected model and an explicitly selected effort. The exact model must be approved before the run.

Use the 30 case IDs in `benchmark-plan.json`. For every case, run the same prompt, disposable repository state, scope, timeout policy, and acceptance contract in both arms. Keep the private task material and repository outside this public source tree.

## Quality and token gate

Each trial requires an independent acceptance evidence ID, complete input/output token counts, and a dated usage evidence reference. The primary result is the percentage change in total input + output tokens across paired tasks. Cached input tokens are already within input tokens. Price records are optional and do not affect this metric. Missing token usage or quality blocks the candidate.

The local gate is exposed by `assessIndependentB0B1` in `benchmark.ts`. It requires at least 30 complete, internally consistent pairs, rejects any malformed, duplicate, or unpaired extra trial, checks that B0 has no model override and B1 uses the declared candidate model, and rejects quality regressions. It always returns `safeForAutomaticRouting: false`. Imported `independent` labels are still claims; the gate does not authenticate a reviewer or invoice.

No paid inference is started by tests or by the default CLI. A real run requires a separate written budget approval and an explicitly approved disposable worktree. Do not report savings from the plan or from synthetic records.


Primary metric: aggregate percent saved input and output tokens; pricing is not needed.
