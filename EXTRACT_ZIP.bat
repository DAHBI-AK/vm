@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - Extract ZIP helper

echo ========================================================
echo   VM - ZIP Extract Helper
echo ========================================================
echo.
echo This helps if Windows unzip fails.
echo Put VM-Portable.zip in the SAME folder as this file,
echo or next to it in the dist folder.
echo.

set "ZIP="
if exist "%~dp0VM-Portable.zip" set "ZIP=%~dp0VM-Portable.zip"
if exist "%~dp0dist\VM-Portable.zip" set "ZIP=%~dp0dist\VM-Portable.zip"
if exist "%~dp0..\VM-Portable.zip" set "ZIP=%~dp0..\VM-Portable.zip"

if "%ZIP%"=="" (
  echo VM-Portable.zip not found near this script.
  echo Place the zip beside EXTRACT_ZIP.bat then run again.
  pause
  exit /b 1
)

set "OUT=%~dp0VM-Portable-Extracted"
echo ZIP: %ZIP%
echo OUT: %OUT%
echo.

if exist "%OUT%" (
  echo Output folder already exists. Remove it first? Closing.
  echo Delete folder manually: %OUT%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%OUT%' -Force"
if errorlevel 1 (
  echo Expand-Archive failed. Try 7-Zip:
  echo https://www.7-zip.org/
  pause
  exit /b 1
)

echo.
echo Extract done.
echo Open folder and run START_HERE.bat or INSTALL_TOOLS.bat
explorer "%OUT%"
pause
endlocal
