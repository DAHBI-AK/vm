@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - Install Required Tools

echo ========================================================
echo   VM - Install required tools
echo ========================================================
echo.
echo This installs:
echo   - Node.js (if missing)
echo   - npm packages
echo   - yt-dlp
echo   - FFmpeg
echo.
echo Next steps after this:
echo   1) CREATE_DESKTOP_SHORTCUT.bat
echo   2) VM.exe
echo   3) SHOW_GUIDE.bat  (optional)
echo ========================================================
echo.

set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%~dp0bin;%~dp0node_modules\.bin;%NODE_DIR%;%PATH%"
set "NEED_RESTART=0"

echo [1/4] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Trying winget install...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo Automatic install failed. Install Node.js LTS manually:
    echo https://nodejs.org/en/download
    start "" "https://nodejs.org/en/download"
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo winget install failed. Open:
    echo https://nodejs.org/en/download
    start "" "https://nodejs.org/en/download"
    pause
    exit /b 1
  )
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  set "NEED_RESTART=1"
  echo Node.js installed.
) else (
  for /f "delims=" %%V in ('node -v 2^>nul') do echo Node.js ready: %%V
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not available in PATH.
  if "%NEED_RESTART%"=="1" (
    echo Close this window and run INSTALL_TOOLS.bat again.
  ) else (
    echo Restart the PC, then run INSTALL_TOOLS.bat again.
  )
  pause
  exit /b 1
)

echo.
echo [2/4] Installing app packages (npm)...
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo npm install failed. Check internet and retry.
  pause
  exit /b 1
)
echo Packages ready.

echo.
echo [3/4] Preparing yt-dlp...
if exist "%~dp0scripts\setup.js" (
  call node "%~dp0scripts\setup.js"
  if errorlevel 1 (
    echo yt-dlp setup warning - it may download on first app launch.
  ) else (
    echo yt-dlp ready.
  )
) else (
  echo scripts\setup.js missing - yt-dlp may download on first launch.
)

echo.
echo [4/4] Checking FFmpeg...
if exist "%~dp0node_modules\ffmpeg-static\ffmpeg.exe" (
  echo FFmpeg ready.
) else (
  echo FFmpeg missing - installing ffmpeg-static...
  call npm install ffmpeg-static --no-fund --no-audit
  if exist "%~dp0node_modules\ffmpeg-static\ffmpeg.exe" (
    echo FFmpeg ready.
  ) else (
    echo FFmpeg still missing. Retry with a stable internet connection.
  )
)

echo.
echo ========================================================
echo   Tools install finished.
echo   Next: CREATE_DESKTOP_SHORTCUT.bat
echo   Then: VM.exe
echo ========================================================
echo.
pause
endlocal
