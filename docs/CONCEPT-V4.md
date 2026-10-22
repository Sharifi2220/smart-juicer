# Smart Juicer V4 – unabhängiges Effizienz- und Qualitätslabor für Coding-Agenten

**Stand: 22.10.2026. Entwicklungsentwurf, nicht öffentlich freigegebener Quell-Commit und kein absolvierter Realtest.**

## 1. Produktentscheidung und historischer Kontext

Die ursprüngliche Idee war eine automatisch agierende, qualitätsbewusste Modell-/Effort-Steuerung für Coding-Aufgaben. Die erste Open-Source-Alpha stellte zunächst einen lokalen, passiven Observer, Shadow-Mode-Metadatenimport, Benchmark-Mathematik und einen gesperrten Codex-Executor bereit. Gemini-Gegenprüfungen und die anschließende unabhängige Codeprüfung legten fehlende reale Kohorten, Survivorship Bias, Tokenprovenienz und Grenzen einfacher Sicherheits- und Qualitätsheuristiken offen.

Daraus folgt: Smart Juicer V4 ist **zuerst ein reproduzierbares, local-first Coding-Agent Efficiency & Quality Lab**. Es bietet Task-Kohorten und einen prüfbaren B0/B1-Vergleich; es behauptet **weder** automatische Optimierung **noch** ein einzigartiges Marktmonopol. Wiederverwendbare Pilot-Evidenz darf einen späteren Opt-in-Effort-Advisor unterstützen. Automatisches Live-Routing bleibt ausgeschaltet. Vorhandene Observer-, Inspector-, Shadow-Mode- und Offline-Planer-Module bleiben erhalten, aber diese können ein Experiment nicht selbst autorisieren.

**Marktnische als Hypothese:** transparentes, möglichst unkompliziertes Same-Model-Effort-Audit mit vorregistriertem Task-Manifest, Mutationstests, UNKNOWN-Provenienz, lokal kontrolliertem Verifier und replizierbarem Bericht. Promptfoo evaluiert bereits Coding-Agenten. Das ist ein Wettbewerbsvergleich, kein Alleinstellungs- oder Umsatzzertifikat.

## 2. Entscheidung aus der neuesten Gemini-Prüfung

| Aussage | V4-Entscheidung |
| --- | --- |
| Gepaarte Non-Inferiority statt McNemar-Nichtsignifikanz | Richtig: n=30 **nur explorativ**; 2x2 Kontingenz wird jetzt zusätzlich berechnet, **keine** aus n=30 behauptete Non-Inferiority. |
| OpenAI `reasoning_tokens`/`cached_tokens` | Richtige Teilmengen von Output/Input, werden nicht erneut addiert. |
| Claude `cache_creation_input_tokens` / `cache_read_input_tokens` | Anders als OpenAI **disjunkte** Addenden zu `input_tokens`; eigener Adapter mit Test ergänzt. |
| Codex Streaming-Usage | CLI-`turn.completed.usage` als maßgeblicher Abschluss; `turn.failed` hat in der überprüften CLI-Implementierung ggf. keine Usage. Ohne vollständiges Terminalereignis `UNKNOWN`. Weder kumulative Stände noch Deltas blind summieren. |
| Journal-ACL | `0o600` ist auf Windows **kein** Ersatz für restriktive NTFS-ACL im hostkontrollierten Journalverzeichnis. |
| Journal-Sync | Datei-`fsync` und auf POSIX zusätzlich Verzeichnis-`fsync` nach Anlage; kein universelles Power-Loss-Durability-Versprechen. Bei `EPERM`/`EBUSY` kurzer begrenzter Lock-Release-Retry, danach fail-closed. |
| Prozessbaum | POSIX-Prozessgruppe und Windows `taskkill /T /F` werden im Executor **nur best effort** angestoßen. Für tatsächliche Sandbox ist Windows Job Object oder OS-/Container-Supervisor erforderlich. |
| TOCTOU | `realpath` und relative Pfadprüfung bleiben nur Advisory; Side-Effect-Grenzen müssen hostseitig durchgesetzt werden. |
| Node 24 | Lokale Node22-Tests ersetzen **niemals** Node24-CI auf Windows und Ubuntu. |
| Patchintegrität | Nur normaler kontexttragender Patch, `git apply --check`; niemals alter `--unidiff-zero`-Patch. |

Die genannten Forschenden oder Anbieter sind keine Partner oder Reviewer dieses Projekts.

## 3. Pilotprotokoll

**Hypothese:** `low` benötigt auf einer festen TypeScript-Unit-Test-Generierungskohorte weniger Input+Output-Tokens als `medium`, ohne relevante Reduktion der fachlich unabhängigen Erfolgsrate. Eine beobachtete Ersparnis von 15–25 % ist ein **interner explorativer Zielkorridor**, keine Vorgabe und kein Produktversprechen.

**Modell:** `gpt-6.1-sol`, falls im tatsächlichen Codex-Konto verfügbar; die offizielle API-Dokumentation bestätigt die beiden Effort-Stufen, nicht das Entitlement des einzelnen Codex-Kontos. Die konkreten Modellnamen/Efforts in CLI, Logs und Abrechnung müssen mit denselben Identitäten nachgewiesen werden. Andernfalls kein Realtest und **keine stille Substitution**.

**Cohort:** 30 vorab unabhängige Aufgaben der einen Klasse `TypeScript-Testgenerierung`, in drei vorregistrierten Komplexitätsgruppen mit je zehn Fällen. B0=`medium`, B1=`low`. Genau 60 vorab registrierte Agentenläufe. Ein Lauf startet im festen Zustand `pending` und geht bei Start in `running`, dann ausschließlich in `completed`, `failed`, `timeout` oder `crashed`. Eine fehlende Eventzeile bleibt im Nenner, aber eine ungeklärte unvollständige Journalsicherung kann den **Evidenzstatus** blockieren. Kein nachträglicher Aufgabenaustausch bei Fehlern.

**Kontrolle:** gleiches Modell, genaue CLI-Version und Konfigurationshashes, isolierter Fixture-Commit, identischer Prompt und Input-Manifesthash, Timeout, Budgetfreigabe, sonstige Tool-Privilegien, Cache-Kaltstart-/Warmstart-Protokoll, ausgewogene und vorab per Seed festgelegte B0/B1-Reihenfolge. Agentenprozesse nie im aktiven Google-Drive-Sync-Root laufen lassen. Rohdaten bleiben beim Betreiber; nur genehmigte bereinigte Auswertungen zurück ins bestehende Drive-Projekt.

**Qualität:** Externer Verifier auf einer schreibgeschützten/vertrauten Kopie: Production-Code unverändert, zulässiger Diff der Testdateien, originale Suite und Typcheck bestanden, keine Skip-/Todo-/Scheintests, ausreichende feste *killbare* Mutanten erfolgreich erkannt. Keine Self-Reports oder vom Agenten modifizierbaren Akzeptanzregeln. Der gegenwärtige Datentyp mit `external_verifier`-Label beweist noch **keine echte unabhängige Ausführung**.

**Korpus:** detaillierte unveränderliche Auswahl- und Mutationsregeln in [TASK-CORPUS-V4.md](TASK-CORPUS-V4.md). Die 30 alten `benchmark-plan.json`-Aufgaben sind eine **andere gemischte Vorbereitung**, nicht dieses geprüfte Pilotmanifest.

## 4. Messvertrag und Inferenz

Für jedes vorregistrierte Taskpaar i und Arm a ist `S_ia=1` genau bei unabhängig akzeptiertem fachlichen Ergebnis, sonst `0`. `N=30` pro Arm, auch bei `pending`, `timeout`, `crashed` und verschwundenen Runs.

- `success_rate_a = sum(S_ia)/30`.
- Paardaten: `n11 = beide erfolgreich`, `n10 = nur B0`, `n01 = nur B1`, `n00 = keiner`. Differenz `D=(n01-n10)/30`.
- Nichtunterlegenheit als spätere, **vorab registrierte** separate Studie: `H0: D <= -Delta`, `H1: D > -Delta`; Delta nach fachlichem Risiko, mit geeignetem gepaartem einseitigen Konfidenzintervall und eigens geplanter Fallzahl. Die hier vorhandene Routine setzt `nonInferiorityEstablished:false` selbst dann, wenn n10=0 ist. Ein McNemar-p-Wert >0,05 ist **kein** Qualitätsnachweis.
- `U_ia = input_tokens + output_tokens` für sämtliche zum Task gehörenden API-Schritte/Retries und zuordenbare Observer-/Verifier-Inferenz. Reasoning ist bereits in Output, OpenAI-Cached in Input. **Claude Cached-Read/Write dagegen additiv zum uncached Input.** Unterschiedliche Anbieter/Tokenizer nicht ohne Kennzeichnung verrechnen.
- `savings_pct = 100*(1-total_tokens_B1/total_tokens_B0)` **nur** bei vollständig verifizierten Messwerten und B0>0. Bei irgendeinem `UNKNOWN` keine Sparquote (kein Nullersatz, keine pauschale Worst-Case-Schätzung).
- `tokens_per_success_a = total_tokens_a / successful_tasks_a` nur bei vollständiger Usage und >0 Erfolgen. Die Erfolgsquote ist immer separat auszuweisen. Kurz gescheiterte Aufgaben können die rohe Tokenmenge senken, aber nie die Qualität erhöhen.
- Latenz, p50/p95, Retries, Kosten und Reviewaufwand getrennt anzeigen. Kein ad-hoc-Mix von Token und Zeit in einem mathematisch unkalibrierten Nutzenscore. Später ggf. monetäre Kostenfunktionen mit vorregistrierten Tarifen/Einheiten.

**Statistische Gefahr:** n=30 ist ein Harness-Pilot. Die Power hängt vor allem von Diskordanzen, Zielmargin und Fehlerwahrscheinlichkeit ab. Es gibt keine allgemeingültige automatische Regel „80–120 Paare genügen“. Auch Mutationserfolg allein kann fachliche Relevanz nicht garantieren; Referenzfälle benötigen Review.

## 5. Modulgrenzen und Quellcode

- `pilot-contract.ts`: lokale Datenstrukturen, Manifesthash, Hashkettenprüfung, feste Kohorte, benannte Usage-Adapter und vollständige 2x2 Kontingenz; diese Datei kann keine externe Evidenz authentifizieren.
- `pilot-journal.ts`: synchrones append-only JSONL mit Journalheader, Host-Manifestbindung, vollständiger Rückleseprüfung, exklusiver `.lock`, `fsync` und begrenztem Windows-Lock-Release-Retry. Crash-Recovery bleibt manuell/fail-closed; Windows-ACLs hostseitig erzwingen.
- `pilot-scope.ts`: advisory Canonical-Paths; niemals Ersatz für OS-Sandbox.
- `codex-executor.ts`: opt-in gated Codex-CLI-Plan/Executor. Normal-B0 verbietet Overrides; Pilot-B0/B1 pinnen Effort und Modell an gebundene Freigabe. Nur komplettem `turn.completed.usage` wird eine Run-Bilanz entnommen; bei Fehler/Timeout und unbekannten Tokens: `UNKNOWN`. Prozessbaumabschaltung **best effort**; harte Kontrolle nur durch Host-Supervisor/Job Object.
- `benchmark.ts`, `auto-model-plan.ts`, `routing-policy.ts` sind Altmodule für offline/advisory; deren Import-Labels und 15/80-Heuristiken sind keine statistische V4-Freigabe für automatische Modellauswahl.

**Keine reale Ausführung** wird von den neuen Test-/Demo-/Dokumentationsbefehlen gestartet. Der separate `npm run execute` ist im Code vorhanden, bleibt standardmäßig blockiert und ist **nicht freigegeben**. Nicht auf vertraulichen Produktiv-Repositories ausführen.

## 6. Sicherheits-/Abnahmestufen

1. Baseline: Git-Quelle `Sharifi2220/smart-juicer` Commit `42b865dcdde01881d9107449e0d23faf7cea966c`; Arbeitsbaum vor Patch `git status --short` und Hashvergleich. PR-Branch, nicht `main` direkt. V3-/V4-MD-Archive sind **nicht** bereits eingespielte GitHub-Commits.
2. S0 offline: alter und neuer Testsatz, TypeScript Node24 CI Windows/Ubuntu, Dateiintegrität und adversariale Journal-/Manifest-/Scope-Tests. `npm ci`, `npm test`, `npm run check`.
3. S1 Host-Harness: externer Operatorprozess, versiegeltes Taskmanifest, Datei-ACLs, Prozessorchestrierung mit tatsächlichem OS-Process-Tree-Containment, sicherer Netzwerk-/Filesystem-/Secret-Scope, nachvollziehbarer Cache-/Usage-Erfassung und funktionsfähigem, isoliertem Hidden-Mutation-Verifier. **Alle acht Realtest-Blocker müssen abgearbeitet werden.**
4. S2 Pilot: erst nach gesonderter Ausführungs-/Budgetfreigabe 60 echte B0/B1-Runs. Fehlende Usage und Fehlerquoten offenlegen, keine Nichtunterlegenheitsbehauptung.
5. S3 Bestätigung: größerer repräsentativer Korpus mit vorregistrierter Non-Inferiority-Margin, Cross-Platform-Replikation, unabhängiger Prüfung und konkreter Kundennachfrage. Erst dann opt-in Advisors, noch später vorsichtiges aktives Routing.

**Betrieb:** Das maßgebliche private Research-Lab-Projekt bleibt im bisherigen Google-Drive-Root. Eine temporäre isolierte Laufzeitumgebung außerhalb der Cloud-Synchronisierung ist nicht ein zweiter kanonischer Projektstand. Bereinigte, geprüfte Endergebnisse werden nur innerhalb des bestehenden Projektordners archiviert. Keine privaten Logs, Prompts, Token- oder Zugangsdaten nach GitHub.

## 7. Nachweisgrenzen zum Stand 22.10.2026

Stand der vorliegenden V4-Integration: statische TypeScript-/Node22-Offline-Tests, kein Node24-Windows-/Linux-CI-Readback, kein echter 30-Task-Korpus, keine externe Hidden-Mutation-Ausführung, keine echte Codex-Kontoberechtigungsprüfung, kein durchgesetztes Anbieter-/Host-Budget, kein abgeschlossener Realtest, keine kausal bewiesene Ersparnis, keine externe Expertenendorsements oder verkauften Audits. Die integrierten lokalen Tests beweisen Programmlogik, nicht OS- oder Providereigenschaften.

## 8. Primärquellen (am 22.10.2026 geprüft)

- OpenAI Codex CLI öffentliche Rust-Events (`TurnCompletedEvent.usage`, `TurnFailedEvent` ohne Usage): https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs
- OpenAI Codex JSONL-Prozessor (letzte totale Usage wird bei Turn-Completion übernommen): https://github.com/openai/codex/blob/main/codex-rs/exec/src/event_processor_with_jsonl_output.rs
- Offizielles Sol-Modell, Effort Low/Medium: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Anthropic disjunkte Cache-Zähler: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Microsoft Windows Job Objects: https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
- Git kontextlose Diffs: https://git-scm.com/docs/git-apply
- Promptfoo als Coding-Agent-Eval-Wettbewerber: https://www.promptfoo.dev/docs/guides/evaluate-coding-agents/
- METR zu Stichproben und Selektionsmechanismen: https://metr.org/blog/2026-02-24-uplift-update/

