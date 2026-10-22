# V4 – Qualitätsspezifikation für den 30-Task-Korpus

**Status: Spezifikation, noch kein echter Korpus.** Diese Datei ersetzt **nicht** `benchmark-plan.json` und beweist keine Mutationstests. Erst nach unabhängiger Erstellung und Prüfung der Fixtures kann ein echtes Task-Manifest versiegelt werden.

## Einheiten und Auswahlregeln

Eine Aufgabe ist eine eigenständig testbare, deterministische TypeScript-Funktion bzw. ein klar abgegrenzter Codepfad mit vorab eingefrorenem unmodifiziertem Production-Code. Agenten dürfen nur explizit ausgewählte Testdateien hinzufügen oder anpassen, keine Originalfunktionen, CI-Dateien, Verifier, Test-Runner-Binaries oder bestehende verdeckte Tests verändern. Aufgaben mit unklaren Requirements, externen APIs, Network-I/O, instabilem Timing, Zufallsquellen ohne kontrollierten Seed oder flakigen Tests werden **vor** dem Einfrieren ausgesondert; nie nach B0/B1-Ergebnissen. Dokumentiere alle Kandidaten, Voreinschlüsse und Ausschlussgründe gegen Cherry Picking.

| Stratum | Anzahl | Beispiel | Qualitätsorakel und Mutanten (nach Eignung) |
| --- | ---: | --- | --- |
| A: rein und einfach | 10 | Parsing, Rundung, Formatierer | mindestens zwei **killbare** sinnvolle Mutanten: Grenzen/Operatoren; Referenztests müssen die Fehler nachweislich finden |
| B: Randfälle | 10 | Nullable, Unicode, leere Arrays, ungültige Inputs | mindestens drei sinnvolle Mutanten: Guard, Exceptionpfad, Fallback |
| C: Verzweigungen/Zustand | 10 | Reducer, Zustandsautomat, geschachtelter Resolver | mindestens vier sinnvolle Mutanten: Übergang, Default-Branch, Zustandsschutz, unerwartete Folge |

Die Mindestzahlen sind **Projektvorgaben und keine wissenschaftlich bewiesene Schwierigkeitsschwelle**. Jedes Mutantenexemplar muss vor dem Pilot unabhängig als kompilierbar, isoliert und durch korrekte Referenztests unterscheidbar bestätigt sein. Ein erzwungener Mutanten-Prozentsatz kann irreführend sein, wenn äquivalente Mutanten existieren.

## Pro Aufgabe in der geheimen Host-Akte festhalten

`taskId`, Stratum, neutraler Prompt, SHA-256 des Prompts, Fixture-Commit, Dateiliste/Schreib-Whitelist, externes Referenzverhalten, ursprünglicher Testzustand, erlaubte Laufzeit, Abhängigkeiten mit Lockfile, vorab definierter Satz Mutanten und SHA-256 jedes Mutanten, minimal benötigte Assertions, Skip-/Todo-Verbote, Reviewer-Entscheidung, Independent-Evidence-ID und Sperrdatum. Hidden Mutanten und vollständige Lösungen dürfen vom Agenten **weder gelesen noch manipuliert** werden. Das aktuelle `PilotManifest` bindet die taskrelevanten Kernfelder; das vollständige Benchmark-Runbook muss vor einer Live-Serie zusätzlich Host-Umgebung und Reihenfolge hashgebunden dokumentieren.

## Unabhängiger Verifier – mindestens

1. Nach einem Agentenlauf einen **neuen** unveränderten Host-Workspace aus dem gepinnten Fixture-Commit aufbauen. Nur freigegebene Agententestdateien in den Host-Workspace kopieren; alles andere diffbasiert verwerfen.
2. Gegen unveränderte Originalimplementierung: `npm ci --offline` oder vorher vertrauenswürdig vorbereitete Abhängigkeiten, Tests und `tsc --noEmit` reproduzierbar ausführen. Kein unkontrollierter Netzwerkzugriff in der Verifikationsphase.
3. Assertions dürfen nicht ausschließlich triviale Konstanten prüfen; Mutanten nacheinander in getrennten Host-Worktrees auf identischem Testpaket prüfen. Ein Kill bedeutet: Tests schlagen beim Mutanten aus dem fachlich erwarteten Grund fehl (nicht durch Setup-/Importfehler).
4. `test.skip`, `test.todo`, `only`, geheime Allowlist-Umgehungen, Schwächung von ursprünglichen Tests und Testframework-Patches als Verstöße zurückweisen.
5. Qualitätsverdict nur über eine Host-authentifizierte Signatur oder ein nicht vom Agenten manipulierbares Artefakt in der geschützten Evidence-Akte an den Reporter übergeben. Die aktuellen `source:'external_verifier'`-Importfelder reichen **nicht** als Echtheitsnachweis.
6. Bei Verifier-Absturz oder fehlenden Hidden-Testbelegen: `accepted=false/UNKNOWN`, niemals Erfolg. Bei fehlerhaftem Original-Fixture vor Teststart Korpusüberarbeitung und neuer Manifesthash; nach Teststart nicht selektiv entfernen.

## Versuchsablauf und Randomisierung

Stratumweise Reihenfolge und Arm-Order vor dem Test deterministisch aus einem gesperrten Seed erzeugen und aufgeschriebenen Plan hashen. Zwischen B0 und B1 jeden Task unter denselben Bedingungen aus einer frischen Revision neu beginnen. Vorab gleiches Timeout, erlaubte Tools, Paketversionen, Dateirechte, CI-Budget, verfügbare Caches und API-Tarifregeln festlegen. Warm- und Cold-Cache nicht ungeplant vermischen; bei Cachekontamination als Abweichung dokumentieren, nicht nachträglich selektieren. Die 30 Aufgaben sind eine Pilotstichprobe, keine formelle bestätigende Nichtunterlegenheitsstudie.
