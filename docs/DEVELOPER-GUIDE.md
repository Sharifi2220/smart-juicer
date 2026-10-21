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

## Test conventions

Prefer deterministic, synthetic, nonsecret fixtures. Keep tests isolated from real user repositories. Assert that missing data stays unknown, automatic agent execution remains off, prompt text is not returned, and ambiguous path handling fails closed. Retain OS-conditional fixture skips in reports rather than presenting them as passes.

## Reporting issues

Include the OS, Node version, exact command, minimal synthetic reproduction, expected and observed metadata, and whether tests passed, failed, or skipped. Redact paths and all credentials; never paste real Codex transcripts or private source files into public issues.

## Release process

After any change to a tagged release: update documentation, commit, deliberately retarget the pre-release tag, and validate reproducibility. Create releases from the reviewed staging only; push checked source, verify GitHub Actions on Ubuntu and Windows, and publish a pre-release only after a genuinely green workflow. Preserve the actual commit SHA and immutable release URL.
