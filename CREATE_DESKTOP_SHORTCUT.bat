@echo off
chcp 65001 >nul
echo ========================================================
echo   VM — Video Downloader Shortcut Installer
echo ========================================================
cd /d "%~dp0"
node scripts\create-shortcuts.js
echo.
echo ✅ تم إنشاء اختصار التطبيق بنجاح على:
echo 1. سطح المكتب (Desktop)
echo 2. قائمة ابدأ / البرامج (Start Menu / Productivity)
echo.
echo 📌 للتثبيت على شريط المهام (Barre des tâches):
echo - انقر بزر الماوس الأيمن على اختصار VM الموجود على سطح المكتب
echo - اختر "Pin to taskbar" أو "تثبيت على شريط المهام"
echo.
pause
