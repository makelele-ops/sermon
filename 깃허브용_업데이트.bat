@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Updating devotional site for GitHub + Cloudflare Pages...
echo.

set "NODE_EXE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

"%NODE_EXE%" ".\tools\sermon-text-to-index.mjs"
if errorlevel 1 (
  echo.
  echo Failed while creating index.html from 새본문.txt.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" ".\tools\cloudflare-sync.mjs"
if errorlevel 1 (
  echo.
  echo Failed while creating the public folder.
  echo.
  pause
  exit /b 1
)

echo.
echo Done.
echo Commit and push this folder with GitHub Desktop.
echo Cloudflare Pages build output directory: public
echo.
pause
