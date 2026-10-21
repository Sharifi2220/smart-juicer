# Security policy

Smart Juicer 0.2.0-alpha.2 is an experimental local alpha. Passive commands remain nonexecuting; a separate Codex execution adapter exists but is disabled by default. It is not a production security boundary and must not be used to authorize agent execution, repository writes, credential handling, or deployment.

## Reporting a vulnerability

Please use GitHub's **Private vulnerability reporting** or a private **Security Advisory** for this repository when that feature is enabled. Do not disclose credentials, private prompts, personal data, or exploitable details in a public issue.

If private reporting is not yet enabled, the repository owner should enable it before publication. Until then, do not publish sensitive details; use the repository owner's private GitHub contact path instead.

## Scope

Reports are welcome for reproducible issues in the code shipped in this repository, especially unexpected writes, network activity, prompt or credential disclosure, unsafe path handling, or claims that contradict the documented passive scope.

The following are known limitations of this alpha and are not security guarantees:

- no automatic agent execution or automatic routing is provided; the opt-in executor may launch Codex **only with explicit approval and host environment guards**, and is not production-certified;
- no production sandbox, comprehensive authorization enforcement, provider billing cap, or complete TOCTOU defense is provided;
- imported data is processed only when the user explicitly names a local file;
- diagnostic commands are experimental and must be run only in an isolated, authorized environment.
