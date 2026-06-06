@echo off
cd /d "%~dp0"

echo.
echo Creating Netlify upload file...
echo.

set "NODE_EXE=node"
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)

"%NODE_EXE%" ".\scripts\build-netlify.mjs"
if errorlevel 1 (
  echo.
  echo Failed. Please check src\content.js for missing quotes or commas.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path -LiteralPath '.\netlify-site.zip') { Remove-Item -LiteralPath '.\netlify-site.zip' -Force }; Compress-Archive -Path '.\netlify\*' -DestinationPath '.\netlify-site.zip' -Force"
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
