# Developer Guide

## Environment and verification

```sh
node --version
npm ci
npm test
npm run check
```

The supported development baseline for this alpha is Node.js 24.x, TypeScript 5.8.3, and `@types/node` 22.15.0, all represented in the locked development dependencies. The package remains `private: true` because GitHub source publication does not entail npm registry publishing.

## Entry points

- `npm run local` — interactive, non-writing task analysis.
- `npm run local -- --demo` — deterministic synthetic preview.
- `npm run shadow-demo` — synthetic import/report.
- `node sj-local.ts --shadow-file FILE` — explicitly imported metadata.
- `npm run observe` — bounded observer stdin JSON; not an agent command.
- `npm run doctor` — local Codex version diagnostic.
- `node sj-dev-cli.ts inspect ROOT` — conservative read-only Git/filesystem scope check.
- `node sj-dev-cli.ts plan ROOT B0` — nonexecuting plan using native Codex defaults.
- `node sj-dev-cli.ts verify ROOT` — review output only, no acceptance.
- `node sj-dev-cli.ts stats TRIALS.json` — arithmetic over external trial data.


- `npm run auto-plan-demo` — synthetic, self-signed offline model-selection demo; never invokes Codex.
- `npm run auto-plan -- FILE` — host-key-gated offline model decision over one explicitly named local evidence file; no agent execution.

## Test conventions

Prefer deterministic, synthetic, nonsecret fixtures. Keep tests isolated from real user repositories. Assert that missing data stays unknown, automatic agent execution remains off, prompt text is not returned, and ambiguous path handling fails closed. Retain OS-conditional fixture skips in reports rather than presenting them as passes.

## Reporting issues

Include the OS, Node version, exact command, minimal synthetic reproduction, expected and observed metadata, and whether tests passed, failed, or skipped. Redact paths and all credentials; never paste real Codex transcripts or private source files into public issues.

## Release process

Never retarget or overwrite an existing published release tag. Prepare changes in a reviewed PR; run locked dependency installation, tests and TypeScript checks on Windows and Ubuntu. Publish a **new** immutable version tag at the reviewed commit only after the release workflow re-runs tests. Confirm the tag target, release notes and prerelease status via the GitHub API. No npm publication occurs.
