@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Updating index.html from new sermon text...
echo.

set "NODE_EXE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

"%NODE_EXE%" ".\tools\sermon-text-to-index.mjs"
if errorlevel 1 (
  echo.
  echo Please open the sermon text file in this folder.
  echo Paste the new sermon text, save it, then run this batch again.
  echo.
  pause
  exit /b 1
)

echo Creating netlify-site.zip...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$items=@('.\index.html'); if (Test-Path -LiteralPath '.\assets') { $items += '.\assets' }; if (Test-Path -LiteralPath '.\archive') { $items += '.\archive' }; if (Test-Path -LiteralPath '.\_redirects') { $items += '.\_redirects' }; if (Test-Path -LiteralPath '.\netlify-site.zip') { Remove-Item -LiteralPath '.\netlify-site.zip' -Force }; Compress-Archive -Path $items -DestinationPath '.\netlify-site.zip' -Force"
if errorlevel 1 (
  echo.
  echo Failed to create netlify-site.zip.
  echo.
  pause
  exit /b 1
)

echo.
echo Done.
echo Upload netlify-site.zip to Netlify.
echo.
pause
