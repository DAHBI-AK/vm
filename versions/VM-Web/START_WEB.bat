@echo off
title VIPD.SHOP Web Downloader Launcher
color 0A
echo ========================================================
echo        Launching VIPD.SHOP Web Application...
echo ========================================================
cd /d "%~dp0"
start "" "http://localhost:3000"
node server.js
pause
