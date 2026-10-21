# Smart Juicer

Smart Juicer is an experimental, local, read-only observer for coding-task metadata. This alpha helps inspect task risk and explicitly imported usage metadata without starting a coding agent or changing a model configuration.

## Status

**0.2.0-alpha.1 — experimental passive alpha**

This is an honest, limited GitHub alpha. It is not production-ready and does not provide an active routing engine.

## What works

- Local task analysis through the interactive preview and the bounded JSON CLI.
- Passive Shadow Mode for synthetic data and explicitly named JSON/JSONL imports.
- Metadata-only summaries for model, thinking effort, token counts, duration, terminal status, failed attempts, and quality markers when those fields are present.
- Diagnostic repository inspection, planning, verification, and benchmark helpers, clearly marked as experimental.
- Regression tests and TypeScript checks that run on Node.js 24.
- Experimental *advisory* evidence-gated candidate model selection from user-supplied paired data; no model is automatically invoked or changed.

## What this alpha does not do

- It does not start Codex or another coding agent.
- It does not automatically execute a model choice, change effort, or alter native configuration. Experimental candidate suggestions require manual review and never invoke Codex.
- It does not read live sessions, discover queues, or collect prompts, credentials, or raw logs.
- It does not guarantee token, cost, latency, or quality improvements.
- It does not provide a production security boundary, sandbox, authorization system, or TOCTOU protection.
- It does not establish the project's open research gates (`G1` and `G2`) for an active engine.

## Requirements

- Node.js 24.0.0 or newer
- npm (the included lockfile is the reproducibility reference)

The package remains `private: true` intentionally. This release is for GitHub source distribution, not npm publication.

## Quick start

```text
npm ci
npm test
npm run check
```

The test suite is local and synthetic. It does not make paid model calls.

## Documentation

- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Passive Shadow Import](docs/SHADOW-IMPORT.md)
- [Developer Guide](docs/DEVELOPER-GUIDE.md)
- [Evidence-gated routing pilot](docs/ROUTING-PILOT.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Verified demo output

The deterministic local preview reports advisory metadata and explicit non-execution markers:

```text
Risiko: UNKNOWN
Bereiche: ui
Hinweise: INCOMPLETE_METADATA, PROTOTYPE_NO_MODEL_MAPPING, UNVERIFIED_SCOPE_NO_LOW_ADVICE
Codex gestartet: NEIN | Modellwechsel: NEIN | Automatische Freigabe: NEIN
```

The exact wording may vary with the selected locale, but the preview never starts an agent or changes model configuration.

## Local task preview

Run the interactive, non-writing preview:

```text
npm run local
```

Enter a non-confidential task and type `ENDE` to stop. For a deterministic smoke run:

```text
npm run local -- --demo
```

The preview reports risk and advisory metadata only. It prints explicit `NEIN` markers for agent execution, model switching, and automatic approval.

The Windows convenience starter is also available:

```text
Smart-Juicer-Start.cmd --demo
```

## Passive Shadow Mode

Use the synthetic fixture:

```text
npm run shadow-demo
```

Or import one explicitly named metadata-only JSON/JSONL file:

```text
node sj-local.ts --shadow-file .\shadow-synthetic.json
node sj-local.ts --shadow-file .\export.jsonl
```

The importer groups events by explicit turn IDs or terminal turn boundaries. Missing observations remain `UNKNOWN` or `null`; an item completion is not treated as proof that a turn completed. Imported prompt text is not returned in records or reports.

Only import files that you are authorized to inspect. The importer is passive and advisory; it does not search for or attach to live sessions.

## Experimental diagnostics

These commands are diagnostic helpers, not an execution engine:

```text
npm run doctor
node sj-dev-cli.ts inspect <repository-root>
node sj-dev-cli.ts plan <repository-root> B0
node sj-dev-cli.ts verify <repository-root>
node sj-dev-cli.ts stats <trials.json>
```

`doctor` performs a local CLI version probe. `plan` creates a non-executing plan and requires explicit human approval in its returned contract. The diagnostic helpers must not be interpreted as a production safety guarantee.

## Experimental candidate recommendation

```text
npm run route -- path/to/explicit-routing-evidence.json
```

Requires at least 30 independent-review-claimed B0/B1 pairs with complete prices and no accepted-quality regression. Missing or ambiguous evidence defaults to native Codex settings. Reported savings are **unverified input claims**; no production savings or active model execution is implied. See [Routing Pilot](docs/ROUTING-PILOT.md).

## Explicit execution adapter

The repository contains a separate `codex-executor.ts` integration for a future, explicitly approved pilot. It is not called by routing. B1 requires an exact model ID and effort in a matching unexpired approval document; B0 explicitly forbids model and effort overrides. Both arms require a clean, isolated Git worktree. The CLI also requires `SMART_JUICER_EXECUTE=1`.

The adapter passes the prompt through stdin, uses `codex exec --json --ephemeral --ignore-user-config`, requests `--ask-for-approval on-request`, applies a bounded read-only or workspace-write sandbox, performs a final scope recheck, and does not return raw event text. It does not authenticate entitlement or billing; `billingCostEur` remains unknown. Do not enable it without separate host, quality, privacy, and budget approval.

## Benchmark preparation

`benchmark-plan.json` defines 30 neutral case IDs for paired B0/B1 runs. `docs/BENCHMARK-PLAN.md` and `assessIndependentB0B1` define the independent acceptance, provider-backed cost, usage-completeness, and no-regression gates. The plan contains no real prompts or cost records and is not a savings result.

## Development

```text
npm test
npm run check
```

The CI workflow runs both commands on Ubuntu and Windows with Node.js 24.

## License

This project is licensed under the Mozilla Public License 2.0 (MPL-2.0). See [LICENSE](LICENSE) for the unmodified license text.

