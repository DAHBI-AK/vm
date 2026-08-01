@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"

if exist "%ELECTRON%" (
    start "" "%ELECTRON%" "%CD%"
    exit /b 0
)

where node >nul 2>&1
if %errorlevel% equ 0 (
    call npx electron "%CD%"
    exit /b 0
)

echo [VM Error] Electron binary not found in node_modules\electron\dist\electron.exe
pause
exit /b 1
