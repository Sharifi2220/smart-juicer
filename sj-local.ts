/** Smart Juicer – local preview, task observation only.
 * No network, file output, Codex agent execution, or model switching.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { observeTask } from './observer.ts';
import { formatShadowReport, loadExplicitShadowFile, summarizeShadow, SYNTHETIC_SHADOW_RECORDS } from './shadow-mode.ts';

const DEMO_PROMPT = 'Ändere ausschließlich die Farbe eines CSS-Buttons';
const MAX_INPUT = 12000;

function showObservation(prompt: string): void {
  const result = observeTask({schema_version:'v0.1', sourceTrust:'user_direct', originalPrompt:prompt});
  stdout.write('\nErgebnis (unverbindliche lokale Analyse)\n');
  stdout.write('Risiko: ' + result.risk_level + '\n');
  stdout.write('Bereiche: ' + result.domains.join(', ') + '\n');
  stdout.write('Hinweise: ' + result.reason_codes.join(', ') + '\n');
  stdout.write('Codex gestartet: NEIN | Modellwechsel: NEIN | Automatische Freigabe: NEIN\n\n');
}

function showShadow(records: Parameters<typeof summarizeShadow>[0]): void {
  stdout.write('\n' + formatShadowReport(summarizeShadow(records)) + '\n\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    stdout.write('Smart Juicer Local Preview: starten ohne Argumente fuer Eingabe oder mit --demo fuer synthetischen Test.\n');
    stdout.write('Shadow Mode: --shadow-demo oder --shadow-file <explizit exportierte JSON/JSONL-Datei>.\n');
    stdout.write('Der Import liest nur die angegebene Datei; keine Live-Sitzungen, Prompts oder Rohprotokolle.\n');
    stdout.write('Keine Modellaufrufe, keine Speicherung, kein automatisches Routing.\n');
    return;
  }
  if (args.length === 1 && args[0] === '--demo') {
    showObservation(DEMO_PROMPT);
    return;
  }
  if (args.length === 1 && args[0] === '--shadow-demo') {
    showShadow(SYNTHETIC_SHADOW_RECORDS);
    return;
  }
  if (args.length === 2 && args[0] === '--shadow-file') {
    showShadow(loadExplicitShadowFile(args[1]));
    return;
  }
  if (args.length !== 0) throw new TypeError('UNSUPPORTED_ARGUMENTS');
  if (!stdin.isTTY || !stdout.isTTY) throw new TypeError('INTERACTIVE_TERMINAL_REQUIRED_USE_DEMO');
  stdout.write('Smart Juicer – lokale Testversion (nur Aufgabenanalyse)\n');
  stdout.write('Keine Installation, kein Modellaufruf, keine Speicherung deiner Eingabe.\n');
  stdout.write('Zum Beenden: ENDE. Nur eigene, nicht vertrauliche Testtexte eingeben.\n\n');
  const rl = createInterface({input:stdin,output:stdout,historySize:0});
  try {
    while (true) {
      const value = (await rl.question('Aufgabe > ')).trim();
      if (value.toLocaleLowerCase('de') === 'ende') break;
      if (!value) { stdout.write('Bitte eine Testaufgabe eingeben.\n'); continue; }
      if (value.length > MAX_INPUT) {stdout.write('Zu lang: maximal 12.000 Zeichen.\n');continue;}
      try {showObservation(value);} catch {stdout.write('Eingabe nicht gueltig; keine Aktion ausgefuehrt.\n');}
    }
  } finally {
    rl.close();
  }
}

void main().catch(() => { stderr.write('SMART_JUICER_LOCAL: START_FEHLGESCHLAGEN\n'); process.exitCode=2; });
