@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%NODE_DIR%;%PATH%"
set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"

if not exist "%NODE_DIR%\node.exe" goto ERR_NODE

if not exist "%ELECTRON%" goto INSTALL_DEPS
goto CHECK_YTDLP

:INSTALL_DEPS
echo [VM] Installing dependencies...
call npm install --no-fund --no-audit
if errorlevel 1 goto ERR_INSTALL
if not exist "%ELECTRON%" goto ERR_ELECTRON
goto CHECK_YTDLP

:CHECK_YTDLP
if not exist "bin\yt-dlp.exe" call node scripts\setup.js
if not exist "VM.exe" call node scripts\create-vm-exe.js >nul 2>&1
start "" /D "%~dp0" "%ELECTRON%" .
exit /b 0

:ERR_NODE
echo [VM] Node.js is required. Install from https://nodejs.org
pause
exit /b 1

:ERR_INSTALL
echo [VM] Failed to install dependencies. Check your internet connection.
pause
exit /b 1

:ERR_ELECTRON
echo [VM] Electron not found. Run VM.bat again.
pause
exit /b 1
