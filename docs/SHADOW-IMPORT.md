# Passive Shadow Import

## Accepted sources

1. A versioned, explicitly provided metadata-only JSON object with `schema_version=v0.2-shadow`, `sourceTrust=explicit_user_import`, `privacyMode=metadata_only`, and an array named `records`.
2. An explicitly named Codex `exec --json` JSONL or App Server NDJSON file containing turn lifecycle and usage events.
3. The synthetic fixture `shadow-synthetic.json` shipped in this repository.

Command examples:

```sh
npm run shadow-demo
node sj-local.ts --shadow-file shadow-synthetic.json
node sj-local.ts --shadow-file path/to/your-export.jsonl
```

Only import files you are permitted to inspect. The importer opens and parses the complete explicitly named file in local process memory, so that file may contain private content even though returned records and reports deliberately omit prompt and event-text fields. Do not provide private exports to issue trackers or commit them to Git.

## Metadata and semantics

Per-turn fields include `id`, `source`, `model`, `thinkingEffort`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `durationMs`, `failedAttempts`, `qualityStatus`, `status`, `observedAt`, and note codes.

- Unknown numeric fields remain `null`, not `0`.
- Cached input tokens are a subset of input tokens when both are known.
- A `turn.started` event cannot mark a turn completed, even if its status field is contradictory.
- `item.completed` is not turn completion or independent quality acceptance.
- A terminal turn event is needed for completed, failed, or interrupted lifecycle status.
- Without explicit evidence of failed attempts, `failedAttempts` remains `null`; observed terminal failure events are counted.
- Quality `PASS` in imported metadata is a recorded claim, not proof of independent test acceptance.
- Without turn IDs, sequential `turn.started` and terminal events delimit implicit turn groups; standalone item events do not create successful turns.
- Summary totals stay `null` when any contributing field is unknown, rather than silently filling in zeros.
- The recommendation is nonbinding: no model is selected and nothing is applied automatically.

## Input limits and caution

The JSONL import is bounded to approximately 2 MiB and 10,000 lines. The metadata JSON record import also enforces a record-count limit. Invalid input fails with an error; error reports and outputs must not echo imported prompt text. Read-only does not prevent a malicious local process or filesystem from changing the selected file concurrently. Do not supply untrusted exports as a basis for execution decisions.

## Minimal metadata JSON example

```json
{
  "schema_version": "v0.2-shadow",
  "sourceTrust": "explicit_user_import",
  "privacyMode": "metadata_only",
  "records": [
    {
      "id": "sample-turn",
      "model": null,
      "thinkingEffort": null,
      "inputTokens": null,
      "cachedInputTokens": null,
      "outputTokens": null,
      "durationMs": null,
      "failedAttempts": null,
      "qualityStatus": "UNKNOWN",
      "status": "unknown"
    }
  ]
}
```
