const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const outputDir = path.join(rootDir, 'dist');
const packageDir = path.join(outputDir, 'VM-Portable');
const zipPath = path.join(outputDir, 'VM-Portable.zip');

const includeItems = [
  'VM.exe',
  'VM.bat',
  'VM.vbs',
  'START.txt',
  'README-PORTABLE.txt',
  'package.json',
  'package-lock.json',
  'assets',
  'bin',
  'src',
  'scripts'
];

const excludeFromNodeModules = new Set([
  '.cache',
  '.bin'
]);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) {
    return;
  }

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(target);
    fs.readdirSync(source).forEach((entry) => {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    });
    return;
  }

  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function writePortableReadme() {
  const readme = `========================================
VM Downloader - نسخة محمولة
========================================

[ Windows - أجهزة الكمبيوتر ]
1. فك ضغط الملف VM-Portable.zip
2. افتح المجلد VM-Portable
3. انقر مرتين على VM.exe (الأيقونة الحمراء)

متطلبات Windows:
- Windows 10 أو أحدث
- Node.js من https://nodejs.org (مرة واحدة فقط)
- اتصال إنترنت عند أول تشغيل

عند أول تشغيل:
- شغّل INSTALL.bat إذا ظهرت رسالة نقص ملفات
- أو انقر VM.exe مباشرة

[ الهواتف - Android / iPhone ]
هذا تطبيق سطح مكتب (Windows) ولا يعمل على الهواتف.
للاستخدام من الهاتف: انسخ الملف المضغوط إلى الكمبيوتر وشغّله هناك.

[ Mac / Linux ]
هذه النسخة مخصصة لـ Windows فقط.

[ نقل التطبيق ]
- يمكن نسخ مجلد VM-Portable كاملاً إلى فلاشة USB
- أو إرسال VM-Portable.zip عبر Google Drive / Telegram

========================================
`;

  fs.writeFileSync(path.join(packageDir, 'README-PORTABLE.txt'), readme, 'utf8');
}

function writeInstallBat() {
  const installBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_DIR=%ProgramFiles%\\nodejs"
set "PATH=%NODE_DIR%;%PATH%"

if not exist "%NODE_DIR%\\node.exe" (
  echo يرجى تثبيت Node.js من https://nodejs.org
  pause
  exit /b 1
)

echo [VM] Installing required files...
call npm install --no-fund --no-audit
call node scripts\\setup.js
call node scripts\\create-vm-exe.js
echo [VM] Ready. Double-click VM.exe
pause
`;

  fs.writeFileSync(path.join(packageDir, 'INSTALL.bat'), installBat, 'utf8');
}

function buildPackageFolder() {
  ensureDir(outputDir);

  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }

  ensureDir(packageDir);

  includeItems.forEach((item) => {
    const source = path.join(rootDir, item);
    const target = path.join(packageDir, item);
    copyRecursive(source, target);
  });

  writePortableReadme();
  writeInstallBat();

  const nodeModulesSource = path.join(rootDir, 'node_modules');
  const nodeModulesTarget = path.join(packageDir, 'node_modules');

  if (fs.existsSync(nodeModulesSource)) {
    ensureDir(nodeModulesTarget);
    fs.readdirSync(nodeModulesSource).forEach((entry) => {
      if (excludeFromNodeModules.has(entry)) {
        return;
      }
      copyRecursive(
        path.join(nodeModulesSource, entry),
        path.join(nodeModulesTarget, entry)
      );
    });
  }
}

function createZip() {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const script = `
$source = '${packageDir.replace(/'/g, "''")}'
$destination = '${zipPath.replace(/'/g, "''")}'
if (Test-Path $destination) { Remove-Item $destination -Force }
Compress-Archive -Path $source -DestinationPath $destination -CompressionLevel Optimal
Write-Output 'ZIP_OK'
`;

  const scriptPath = path.join(__dirname, '_package-temp.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');

  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ], {
      cwd: rootDir,
      encoding: 'utf8'
    }).trim();

    return output.includes('ZIP_OK') && fs.existsSync(zipPath);
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // ignore
    }
  }
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  if (!fs.existsSync(path.join(rootDir, 'VM.exe'))) {
    execFileSync(process.execPath, [path.join(__dirname, 'create-vm-exe.js')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  }

  console.log('[package] Building portable folder...');
  buildPackageFolder();
  console.log('[package] Creating ZIP archive...');

  if (!createZip()) {
    console.error('[package] Failed to create ZIP.');
    process.exit(1);
  }

  const size = fs.statSync(zipPath).size;
  console.log(`[package] Done: ${zipPath}`);
  console.log(`[package] Size: ${formatSize(size)}`);
}

main();
