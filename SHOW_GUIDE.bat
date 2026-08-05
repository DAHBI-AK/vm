@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if exist "%~dp0guide.html" (
  start "" "%~dp0guide.html"
  exit /b 0
)
echo guide.html not found.
pause
exit /b 1
