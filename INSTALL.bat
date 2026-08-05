@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - Setup
echo ========================================================
echo   VM - Shortcuts setup
echo ========================================================
echo.
echo Tip: run INSTALL_TOOLS.bat first if Node.js is missing.
echo.

set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%~dp0bin;%~dp0node_modules\.bin;%NODE_DIR%;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found.
  echo Run INSTALL_TOOLS.bat first.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

echo [1/2] Checking binaries...
if exist "%~dp0bin\yt-dlp.exe" (
  echo   yt-dlp: Ready
) else (
  echo   yt-dlp missing - run INSTALL_TOOLS.bat
)

if exist "%~dp0node_modules\ffmpeg-static\ffmpeg.exe" (
  echo   FFmpeg: Ready
) else (
  echo   Installing FFmpeg package...
  call npm install --no-fund --no-audit
)

echo.
echo [2/2] Creating shortcuts...
if exist "%~dp0scripts\create-shortcuts.js" (
  call node "%~dp0scripts\create-shortcuts.js"
) else (
  echo   create-shortcuts.js missing
)

echo.
echo Done. Start VM.exe
pause
endlocal
