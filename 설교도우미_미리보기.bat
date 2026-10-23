@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
"%NODE_EXE%" ".\tools\cloudflare-sync.mjs"
"%NODE_EXE%" ".\tools\open-sermon-assistant.mjs"
if errorlevel 1 pause
