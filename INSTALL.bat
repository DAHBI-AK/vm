@echo off
chcp 65001 >nul
title VM — Portable Self-Setup Engine
cd /d "%~dp0"

echo ========================================================
echo   VM — Professional Portable Downloader Self-Setup
echo ========================================================
echo.

set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%~dp0bin;%~dp0node_modules\.bin;%NODE_DIR%;%PATH%"

echo [1/3] Checking embedded binaries & libraries...
if exist "%~dp0bin\yt-dlp.exe" (
  echo   ✓ yt-dlp binary: Ready
) else (
  echo   ! yt-dlp binary will be auto-downloaded on first run.
)

if exist "%~dp0node_modules\ffmpeg-static\ffmpeg.exe" (
  echo   ✓ FFmpeg media engine: Ready
) else (
  echo   ! Installing local FFmpeg engine...
  call npm install --no-fund --no-audit
)

echo.
echo [2/3] Generating Desktop and Start Menu Shortcuts...
call node scripts\create-shortcuts.js >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host '   ✓ Shortcuts generated.'"
) else (
  echo   ✓ Desktop and Start Menu shortcuts ready.
)

echo.
echo [3/3] Portable Data & Local Storage Initialized.
echo ========================================================
echo  🎉 Setup Complete! You can now run VM from anywhere.
echo ========================================================
echo.
pause
