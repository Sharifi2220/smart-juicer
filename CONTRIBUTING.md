# Contributing to Smart Juicer

Thank you for considering a contribution. Smart Juicer is an experimental TypeScript/Node.js tool for local task-risk observations and passive, explicitly imported coding-agent metadata. The public release does not execute agents or select models.

## Development setup

Requirements: Node.js 24 or later, npm, and Git for repository-fixture tests.

```sh
npm ci
npm test
npm run check
npm run local -- --demo
npm run shadow-demo
```

Use a clean, disposable development clone or worktree for tests. Some Git fixture tests create temporary repositories, symlinks, or hardlinks; Windows permissions or cloud-synced test paths can interfere with fixture creation. A skipped security fixture is not a security pass.

## Good first contributions

- Strengthen fixture coverage for malformed JSON/JSONL lifecycle events.
- Improve diagnostics and documented error messages without echoing imported text.
- Add portable tests and explain Windows and Linux differences.
- Improve documentation and usage examples.
- Design independent, reproducible quality-validation fixtures. Keep ROI claims out of the alpha.

## Contribution workflow

1. Open an issue describing the bug or change, expected behavior, and affected platform.
2. Create a focused branch with a small, reviewable change.
3. Preserve fail-closed behavior, UNKNOWN/null semantics, nonexecuting defaults, and the explicit-import boundary.
4. Add regression tests and run `npm test` and `npm run check`.
5. Open a pull request with summary, test evidence, privacy implications, and known limitations.
6. Never add secrets, real user prompts, session exports, personal data, local absolute paths, or unrelated project documents to fixtures.

## Security and scope

The current observer is advisory, not a sandbox, authorization system, or active routing engine. Do not quietly change auto-execution guards or treat snapshot filesystem checks as an atomic TOCTOU defense. Changes affecting execution, privileges, credentials, repository writes, or publication require explicit maintainer design and security review.

## License

By contributing, you agree that your contributions will be made available under the Mozilla Public License 2.0 (MPL-2.0). Ensure you have the rights to submit the code.
