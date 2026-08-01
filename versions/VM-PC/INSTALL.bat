@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_DIR=%ProgramFiles%\nodejs"
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\node.exe" (
  echo يرجى تثبيت Node.js من https://nodejs.org
  pause
  exit /b 1
)

echo [VM] Installing required files...
call npm install --no-fund --no-audit
call node scripts\setup.js
call node scripts\create-vm-exe.js
echo [VM] Ready. Double-click VM.exe
pause
