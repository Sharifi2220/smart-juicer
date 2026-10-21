# Research-based expert review team and responsibilities

**Status:** Proposed **review roles**, not recruited or hired individuals. No researcher named below participates in Smart Juicer or endorses it. The word *team* here denotes the expertise and independent review functions needed before enabling automatic Codex model switching.

## Relevant published expertise

| Field | Published source / authors | Research insight applied |
| --- | --- | --- |
| Learned LLM routing | Isaac Ong et al., UC Berkeley / LMSYS *RouteLLM* (2024) | Calibrate thresholds on representative incoming tasks; routing trades efficiency against model quality |
| Model cascades | Lingjiao Chen, Matei Zaharia, James Zou, *FrugalGPT* (2023) | A staged response/abstention strategy can avoid always invoking the largest model |
| Evaluation methodology | Stanford CRFM *HELM* team | Separate task quality, efficiency, reliability and broader evaluation dimensions |
| System safety | OWASP GenAI Security Project contributors | Minimize agent privileges, distrust instructions from untrusted data, approve high-impact operations |
| Provider capability | OpenAI model selection/evaluation documentation | Compare models/effort on actual workloads; do not assume smaller models always perform sufficiently |

Primary sources:
https://sky.cs.berkeley.edu/project/routellm/
https://arxiv.org/abs/2305.05176
https://github.com/stanford-crfm/helm
https://owasp.org/www-project-top-10-for-large-language-model-applications/
https://developers.openai.com/api/docs/guides/model-selection

The literature generally optimizes **financial cost, quality or latency**, not necessarily Smart Juicer's primary **input + output token volume**. Report research findings separately from project measurements; do not transfer the papers' performance figures to this software.

## Proposed independent project review roles

| Proposed reviewer role | Questions / evidence | Approval boundary |
| --- | --- | --- |
| **1. Routing and ML evaluator** | Is routing calibrated per task class? Are signed data fresh, representative and non-leaking? Does native fallback work? | Approves evidence methodology, not live execution |
| **2. Software quality lead** | Do B0 and B1 meet identical acceptance criteria on isolated reproducible commits? Are tasks graded blindly? Are retries counted? | Signs an independent quality report |
| **3. Security and Windows filesystem reviewer** | Are approved roots genuinely isolated? Do symlinks, junctions, hardlinks, TOCTOU, secret paths and process trees fail safely? | Separately reviews host execution isolation |
| **4. Provider and token-usage specialist** | Is each Codex JSONL usage event per-turn or cumulative? Are cached tokens normalized and not counted twice? Is entitlement checked via the actual host? | Certifies the *normalization procedure*, not a token-savings claim |
| **5. Privacy/release maintainer** | Are exports sanitized, versioned, source-backed, licence-compliant and free of private Google Drive documents? Is each tag immutable? | Approves GitHub release contents |
| **6. Human product operator** | Is the task appropriate? Is the budget approved? Is the selected model in the account? Can routing immediately be disabled or rolled back? | Authorizes concrete live-agent pilot runs |

The **same person should not manufacture trial records and independently approve their acceptance**. Before claiming independent validation, record reviewer identity, date, fixture hashes, results and conflicts of interest in the **private** Research Lab, never embed personal identifiers or private reviewer artifacts in the public repository.

## Proposed acceptance checklist

1. A reproducible 30-or-more task-pair dataset **for each task class permitted to auto-route**, with exact task/revision/scope matching and complete provider-normalized token usage.
2. Quality accepted in *both* arms; any failed, skipped or unreviewed task blocks that cohort. Blind review recommended.
3. Conservative model selection: aggregate token reduction at least 15%, at least 80% per-pair nonregression for this initial pilot, no gross imbalanced tail.
4. Host keys bound to approved evaluators, signing-key rotation/revocation procedure, explicit maximum evidence age (<=30 days), and verifiable repository/model identities.
5. Independent security and host authorization assessment before any **active** model execution; the existing offline planner is not a security boundary.
6. Negative cases: expired/tampered signatures, missing counts, mixed task classes, unsupported models, denied entitlement, unsafe scope, git revision drift and prompt injection attempts must keep native defaults.
7. A documented kill switch, ongoing drift checks, comparative quality dashboard and rollback rules before any production opt-in.

## What can be completed now / what cannot

Current maintainers can implement and test the offline selection logic, document sources, produce public reproducible *synthetic* tests and publish source code. They **cannot legitimately claim** that any external researcher completed a Smart Juicer review, or that real Codex tokens were saved without independent signed run data. Recruiting a real independent reviewer or performing a paid live trial remains a separate operator action.
