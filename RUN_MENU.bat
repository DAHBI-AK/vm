@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VM - Run Commands

:menu
cls
echo ========================================================
echo   VM - CMD Menu
echo ========================================================
echo.
echo   [1] Install required tools
echo   [2] Create desktop shortcut
echo   [3] Run VM.exe
echo   [4] Show image guide
echo   [0] Exit
echo.
set /p choice=Choose: 

if "%choice%"=="1" goto tools
if "%choice%"=="2" goto desk
if "%choice%"=="3" goto run
if "%choice%"=="4" goto guide
if "%choice%"=="0" exit /b 0
goto menu

:tools
call "%~dp0INSTALL_TOOLS.bat"
goto menu

:desk
call "%~dp0CREATE_DESKTOP_SHORTCUT.bat"
goto menu

:run
if exist "%~dp0VM.exe" (
  start "" "%~dp0VM.exe"
) else (
  echo VM.exe not found
  pause
)
goto menu

:guide
call "%~dp0SHOW_GUIDE.bat"
goto menu
