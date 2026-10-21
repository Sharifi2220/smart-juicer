# Research-backed evaluation guidance (21 October 2026)

Smart Juicer is an experimental open-source observer and *advisory* model comparison tool. Its main efficiency metric is **percentage reduction in total processed tokens**, not money. These recommendations are a synthesis of published technical guidance; they are **not** a claim that Stanford, OpenAI, Anthropic, or any benchmark author has reviewed or endorsed Smart Juicer.

## 1. Define the unit correctly

For the current, normalized Smart Juicer B0/B1 schema, a run's total volume is `inputTokens + outputTokens`. For an accepted, matched evaluation cohort:

```text
token_saving_percent = 100 * (1 - sum(B1 totalTokens) / sum(B0 totalTokens))
```

A negative result is an increase in token consumption. B0 total must be positive. Use *aggregate paired totals*, not a mean of individual percentage changes with different baselines. Include all turns, retries and tool-related model calls in the declared run scope; otherwise qualify the observation as partial rather than a whole-task saving. Comparing one successful candidate attempt against multiple baseline retries would be misleading unless both use the same retry policy and scope.

### Provider-specific token usage normalization

**OpenAI:** its API usage fields include `input_tokens` and `input_tokens_details.cached_tokens`; cached tokens are a subset of input, and must not be added to the total again. The public API documentation differentiates input cache reads and writes. See [OpenAI prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching).

**Anthropic:** Claude usage reports `input_tokens` (uncached), `cache_creation_input_tokens`, and `cache_read_input_tokens` separately. Their normalized total input is the **sum of those three**, unlike OpenAI's inclusive top-level input count. See [Claude prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

**Codex JSONL:** only import token counts whose interpretation has been verified for the exact CLI/version/event shape. Include neither duplicated cumulative events nor both a total and its component cache fields. Do not silently apply a provider-specific formula to an unknown source. If provenance or units are unclear, report UNKNOWN and require review.

These are **measurement conventions**, not guaranteed cost or compute savings. A cached input token still counts as a token in this primary volume metric, even when its marginal provider price is lower.

## 2. Quality is a prerequisite, not a tradeoff assumed away

Stanford CRFM's [Holistic Evaluation of Language Models (HELM)](https://crfm.stanford.edu/2022/11/17/helm) argues for multidimensional evaluation, broad scenario coverage and explicit acknowledgement of missing metrics. Smart Juicer therefore applies a conservative quality gate *before* considering token savings.

OpenAI's [evaluation documentation](https://developers.openai.com/api/docs/guides/evals) emphasizes representative evaluation data and clear testing criteria/graders. Each B0/B1 pair needs a written acceptance contract, tests appropriate for the task, and independent review of whether the produced work actually satisfies it.

For software engineering, [SWE-bench Verified](https://www.swebench.com/verified) illustrates task vetting by humans, but its validity is not a permanent guarantee: OpenAI published a [July 2026 coding-evaluation audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/) describing benchmark defects and contamination concerns. The practical implication is to validate and refresh fixtures, not to copy a leaderboard result into a local savings claim.

## 3. Minimum benchmark design

- Use at least 30 **valid, matched pairs**, drawn from UI, documentation and development tasks; 30 is a pilot gate, **not** a statistical proof of generality.
- Same task description, repository commit, initial filesystem state, access scope, acceptance criteria and retry/timeout limits for B0 and B1.
- Record exact model IDs, effort, CLI version, run boundaries, usage-source reference and timestamps outside the public repository; vary/randomize run order where possible to reduce temporal or cache bias.
- Evaluate quality independently, ideally blinded to the candidate model, and reject regressions.
- Require complete normalized usage. A provider label or independent-review flag inside a JSON file is *not* authenticated proof by itself.
- Report the number of pairs, baseline and candidate token totals, claimed token saving %, quality acceptance results, missing data and scope limitations. A positive 15% threshold is only an advisory/manual-review threshold, never an automatic model-routing authorization.

## 4. Safety and honesty

The supplied 30.00% in test fixtures is synthetic. It is **not** a measured outcome, not a token-saving guarantee, and not endorsed by any cited researcher. There has been no real paid model benchmark under this release.

The execution adapter is separate from the routing policy and is off by default. Host-approved root and linked Git-worktree checks do not establish an OS sandbox; approval metadata `budgetEur` is **not** an enforced provider billing ceiling. Running models or changing production repositories requires separate host/security/budget approvals.

## References

1. Stanford CRFM, *Holistic Evaluation of Language Models*, https://crfm.stanford.edu/2022/11/17/helm (published 2022; consulted 2026-10-21).
2. OpenAI, *Working with evals*, https://developers.openai.com/api/docs/guides/evals (consulted 2026-10-21).
3. OpenAI, *Prompt caching*, https://developers.openai.com/api/docs/guides/prompt-caching (consulted 2026-10-21).
4. Anthropic, *Prompt caching*, https://platform.claude.com/docs/en/build-with-claude/prompt-caching (consulted 2026-10-21).
5. SWE-bench, *Verified*, https://www.swebench.com/verified (consulted 2026-10-21).
6. OpenAI, *Separating signal from noise in coding evaluations*, https://openai.com/index/separating-signal-from-noise-coding-evaluations/ (published 2026-07-08; consulted 2026-10-21).
