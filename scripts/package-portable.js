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
  'INSTALL.bat',
  'INSTALL_TOOLS.bat',
  'CREATE_DESKTOP_SHORTCUT.bat',
  'RUN_MENU.bat',
  'SHOW_GUIDE.bat',
  'START_HERE.bat',
  'EXTRACT_ZIP.bat',
  'guide.html',
  'README.txt',
  'package.json',
  'package-lock.json',
  'assets',
  'bin',
  'src',
  'scripts',
  'guide-images'
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
  const readme = `VM Downloader - Portable (Windows)

IMPORTANT:
- All command files use ENGLISH names only (CMD-safe).
- Unzip with Windows Explorer, 7-Zip, or EXTRACT_ZIP.bat

Commands (double-click):
  1) START_HERE.bat
  2) INSTALL_TOOLS.bat
  3) CREATE_DESKTOP_SHORTCUT.bat
  4) VM.exe

Optional:
  RUN_MENU.bat
  SHOW_GUIDE.bat

Guide images (in order):
  guide-images\\1-what-vm-does.png
  guide-images\\2-how-vm-works.png
  guide-images\\3-install-steps.png
`;
  fs.writeFileSync(path.join(packageDir, 'README.txt'), readme, 'utf8');
  fs.writeFileSync(path.join(packageDir, 'README-PORTABLE.txt'), readme, 'utf8');
}

function writeInstallBat() {
  // Keep INSTALL.bat from includeItems (ASCII source file). Do not overwrite with Arabic.
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
