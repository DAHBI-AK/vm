@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - START HERE

echo ========================================================
echo   VM Portable - START HERE
echo ========================================================
echo.
echo Unzip first if needed, then run in this order:
echo.
echo   1) INSTALL_TOOLS.bat
echo   2) CREATE_DESKTOP_SHORTCUT.bat
echo   3) VM.exe
echo.
echo Optional:
echo   RUN_MENU.bat
echo   SHOW_GUIDE.bat
echo.
echo All command file names are ENGLISH only.
echo ========================================================
echo.
pause

echo.
echo Opening INSTALL_TOOLS.bat ...
call "%~dp0INSTALL_TOOLS.bat"
