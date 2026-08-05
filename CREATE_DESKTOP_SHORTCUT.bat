@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - Create Desktop Shortcut

echo ========================================================
echo   VM - Create Desktop Shortcut
echo ========================================================
echo.

set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%~dp0bin;%~dp0node_modules\.bin;%NODE_DIR%;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found.
  echo Run INSTALL_TOOLS.bat first.
  pause
  exit /b 1
)

if not exist "%~dp0VM.exe" (
  echo VM.exe not found in this folder.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\create-shortcuts.js" (
  echo scripts\create-shortcuts.js not found.
  pause
  exit /b 1
)

echo Creating desktop shortcut...
call node "%~dp0scripts\create-shortcuts.js"
if errorlevel 1 (
  echo Shortcut creation failed.
  pause
  exit /b 1
)

echo.
echo Shortcut created on Desktop and Start Menu.
echo.
pause
endlocal
