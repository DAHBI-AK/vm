@echo off
title VM Mobile App Launcher
color 0B
echo ========================================================
echo        Launching VM Mobile Standalone App...
echo ========================================================
cd /d "%~dp0"
start "" "http://localhost:3000"
node server.js
pause
