# Smart Juicer v0.2.0-alpha.2

**Experimental GitHub pre-release.** No npm package is published. This release is source-only and not intended for unattended or production deployment.

## Included

- Local, nonexecuting task analysis, metadata-only passive Shadow Mode, and read-only diagnostic commands.
- **Advisory-only** B0/B1 candidate comparison based on the percentage reduction in aggregate input + output tokens. Cached input is counted once; currency prices are not part of this metric.
- Independent-quality-claimed 30-pair benchmark plan and conservative usage completeness gate. The 15% saving threshold only admits a candidate for **manual review**.
- A **separate**, **disabled-by-default** experimental Codex execution adapter. It requires `SMART_JUICER_EXECUTE=1`, a host-pinned `SMART_JUICER_APPROVED_ROOT`, a verified linked Git worktree, a fresh explicit request approval, an explicit B1 model and effort, and time/output bounds. Routing never invokes it.
- Windows and Ubuntu Node.js 24 test suite, TypeScript checks, developer notes and research-backed evaluation guidance.

## Safety and accuracy

**No real token savings have been measured or independently verified.** The often-cited 30% result comes from synthetic/imported fixture data and must not be advertised as field performance. `claimedTokenSavingsPercent` is computed from imported claims, not audited provider usage. Cross-provider cache usage fields require normalization; see [Research and evaluation](https://github.com/Sharifi2220/smart-juicer/blob/v0.2.0-alpha.2/docs/RESEARCH-AND-EVALUATION.md).

The adapter has not been used for paid inference. Its budget value is **not** a provider-enforced financial cap. Git-worktree inspection and Codex sandbox flags are **not** production isolation or a complete TOCTOU defense. Independent quality acceptance, live usage provenance, host privileges, model entitlement and execution budget authorization remain open. Do not point it at production repositories.

## Quick verification

```sh
npm ci
npm test
npm run check
npm run shadow-demo
npm run local -- --demo
```

Node.js 24 or newer is required. No paid model invocation is performed by these commands.

## Further reading

- [README](https://github.com/Sharifi2220/smart-juicer/blob/v0.2.0-alpha.2/README.md)
- [Developer Guide](https://github.com/Sharifi2220/smart-juicer/blob/v0.2.0-alpha.2/docs/DEVELOPER-GUIDE.md)
- [Benchmark plan](https://github.com/Sharifi2220/smart-juicer/blob/v0.2.0-alpha.2/docs/BENCHMARK-PLAN.md)
- [Research and evaluation sources](docs/RESEARCH-AND-EVALUATION.md)
- [Security](https://github.com/Sharifi2220/smart-juicer/blob/v0.2.0-alpha.2/SECURITY.md)

The tagged source, CI result and release metadata, not an unreviewed local directory, define the published artifact.

## Publication integrity

This pre-release is published only after the exact main-branch commit passes Windows and Ubuntu CI. The publish job verifies that this release-notes file changed in that commit and refuses to move an existing tag.
