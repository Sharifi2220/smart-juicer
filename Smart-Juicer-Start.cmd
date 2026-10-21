@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0" || (echo Smart Juicer: Projektordner nicht erreichbar.& pause & exit /b 2)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt oder ist nicht im PATH.
  popd
  pause
  exit /b 2
)
echo Smart Juicer - lokaler Testmodus, keine automatische Codex-Ausfuehrung.
echo Shadow-Demo: Smart-Juicer-Start.cmd --shadow-demo
echo Import:     Smart-Juicer-Start.cmd --shadow-file C:\Pfad\zu\export.jsonl
node "sj-local.ts" %*
set "SJ_EXIT=%ERRORLEVEL%"
popd
if not "%SJ_EXIT%"=="0" echo Smart Juicer wurde mit Fehlercode %SJ_EXIT% beendet.
pause
exit /b %SJ_EXIT%
