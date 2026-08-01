const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { execFileSync: execNode } = require('child_process');

const rootDir = path.join(__dirname, '..');
const vmExe = path.join(rootDir, 'VM.exe');
const assetsDir = path.join(rootDir, 'assets');
const rendererAssetsDir = path.join(rootDir, 'src', 'renderer', 'assets');
const iconPng = path.join(assetsDir, 'icon.png');
const iconIco = path.join(assetsDir, 'icon.ico');
const splashPng = path.join(assetsDir, 'splash.png');
const vmIconPng = path.join(assetsDir, 'vm-icon.png');
const rendererVmIcon = path.join(rendererAssetsDir, 'vm-icon.png');
const rendererSplash = path.join(rendererAssetsDir, 'splash.png');
const appName = 'VM';
const appTitle = 'VM — Downloader';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyIfExists(source, target) {
  if (fs.existsSync(source)) {
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
    return true;
  }
  return false;
}

function syncIcons() {
  ensureDir(assetsDir);
  ensureDir(rendererAssetsDir);

  const source = fs.existsSync(iconPng)
    ? iconPng
    : (fs.existsSync(rendererVmIcon) ? rendererVmIcon : null);

  if (!source) {
    console.warn('[brand] No source icon found.');
    return false;
  }

  if (!fs.existsSync(iconPng)) {
    fs.copyFileSync(source, iconPng);
  }

  copyIfExists(rendererVmIcon, vmIconPng);
  copyIfExists(iconPng, vmIconPng);
  copyIfExists(iconPng, rendererVmIcon);
  copyIfExists(splashPng, rendererSplash);
  copyIfExists(iconPng, rendererSplash);

  return true;
}

function runPowerShell(scriptBody) {
  const scriptPath = path.join(__dirname, '_brand-temp.ps1');
  fs.writeFileSync(scriptPath, scriptBody, 'utf8');

  try {
    return execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ], {
      cwd: rootDir,
      encoding: 'utf8'
    }).trim();
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // ignore
    }
  }
}

function buildWindowsIcon() {
  if (process.platform !== 'win32' || !fs.existsSync(iconPng)) {
    return;
  }

  const script = `
Add-Type -AssemblyName System.Drawing
$pngPath = '${iconPng.replace(/'/g, "''")}'
$icoPath = '${iconIco.replace(/'/g, "''")}'
$bitmap = New-Object System.Drawing.Bitmap($pngPath)
$size = [Math]::Min(256, [Math]::Min($bitmap.Width, $bitmap.Height))
$resized = New-Object System.Drawing.Bitmap($bitmap, $size, $size)
$icon = [System.Drawing.Icon]::FromHandle($resized.GetHicon())
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$resized.Dispose()
$bitmap.Dispose()
$icon.Dispose()
Write-Output 'ICON_OK'
`;

  try {
    runPowerShell(script);
    console.log('[brand] Windows icon created.');
  } catch (error) {
    console.warn('[brand] Icon build skipped:', error.message);
  }
}

function resolveShortcutIcon() {
  if (fs.existsSync(vmIconPng)) {
    return vmIconPng;
  }
  if (fs.existsSync(iconPng)) {
    return iconPng;
  }
  if (fs.existsSync(iconIco) && fs.statSync(iconIco).size > 500) {
    return iconIco;
  }
  return iconPng;
}

function createVmExe() {
  if (fs.existsSync(vmExe)) {
    return true;
  }

  const createScript = path.join(__dirname, 'create-vm-exe.js');
  if (!fs.existsSync(createScript)) {
    return false;
  }

  try {
    execNode(process.execPath, [createScript], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    return fs.existsSync(vmExe);
  } catch (error) {
    console.warn('[brand] VM.exe build skipped:', error.stderr || error.message);
    return false;
  }
}

function createShortcut(shortcutPath, launcherPath) {
  const iconTarget = resolveShortcutIcon();

  const script = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
$Shortcut.TargetPath = '${launcherPath.replace(/'/g, "''")}'
$Shortcut.WorkingDirectory = '${rootDir.replace(/'/g, "''")}'
$Shortcut.WindowStyle = 1
$Shortcut.Description = '${appTitle.replace(/'/g, "''")}'
$Shortcut.IconLocation = '${iconTarget.replace(/'/g, "''")},0'
$Shortcut.Save()
Write-Output 'SHORTCUT_OK'
`;

  const output = runPowerShell(script);
  return output.includes('SHORTCUT_OK');
}

function createAppShortcuts() {
  if (process.platform !== 'win32') {
    return;
  }

  const launcher = fs.existsSync(vmExe)
    ? vmExe
    : path.join(rootDir, 'VM.vbs');

  if (!fs.existsSync(launcher)) {
    return;
  }

  const shortcuts = [
    path.join(rootDir, `${appName}.lnk`),
    path.join(process.env.USERPROFILE || '', 'Desktop', `${appName}.lnk`)
  ];

  shortcuts.forEach((shortcutPath) => {
    try {
      const parentDir = path.dirname(shortcutPath);
      if (!fs.existsSync(parentDir)) {
        return;
      }
      if (createShortcut(shortcutPath, launcher)) {
        console.log(`[brand] Shortcut created: ${shortcutPath}`);
      }
    } catch (error) {
      console.warn(`[brand] Shortcut skipped (${shortcutPath}):`, error.message);
    }
  });
}

function main() {
  try {
    if (!syncIcons()) {
      return;
    }
    buildWindowsIcon();
    createVmExe();
    createAppShortcuts();
    console.log('[brand] VM branding ready.');
  } catch (error) {
    console.warn('[brand] Branding skipped:', error.message);
  }
}

main();
