const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetExe = path.join(__dirname, '..', 'VM.exe');
const iconPath = path.join(__dirname, '..', 'assets', 'vm-icon.ico');
const workingDir = path.join(__dirname, '..');

const shortcutName = 'VM.lnk';

function createShortcut(destPath) {
  try {
    const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${destPath.replace(/'/g, "''")}')
$Shortcut.TargetPath = '${targetExe.replace(/'/g, "''")}'
$Shortcut.WorkingDirectory = '${workingDir.replace(/'/g, "''")}'
$Shortcut.Description = 'VM — Professional Video & Audio Downloader'
if (Test-Path '${iconPath.replace(/'/g, "''")}') {
  $Shortcut.IconLocation = '${iconPath.replace(/'/g, "''")}'
}
$Shortcut.Save()
`;
    const tempPsFile = path.join(__dirname, 'temp_shortcut.ps1');
    fs.writeFileSync(tempPsFile, psScript, 'utf8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPsFile}"`, { stdio: 'ignore' });
    try { fs.unlinkSync(tempPsFile); } catch {}
    console.log(`Successfully created shortcut: ${destPath}`);
    return true;
  } catch (err) {
    console.error(`Failed to create shortcut at ${destPath}:`, err.message);
    return false;
  }
}

function cleanOldShortcuts(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
      if ((file.includes('VM') || file.includes('Video Downloader')) && file.endsWith('.lnk') && file !== 'VM.lnk') {
        try {
          fs.unlinkSync(path.join(dirPath, file));
          console.log(`Removed old shortcut: ${file}`);
        } catch {}
      }
    });
  } catch {}
}

const userProfile = process.env.USERPROFILE || 'C:\\Users\\Admin';
const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');

const desktopDir = path.join(userProfile, 'Desktop');
const publicDesktopDir = path.join('C:', 'Users', 'Public', 'Desktop');
const startMenuDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const startMenuProdDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Productivity');

[desktopDir, publicDesktopDir, startMenuDir, startMenuProdDir].forEach(cleanOldShortcuts);

createShortcut(path.join(desktopDir, shortcutName));
createShortcut(path.join(startMenuDir, shortcutName));
try {
  if (!fs.existsSync(startMenuProdDir)) {
    fs.mkdirSync(startMenuProdDir, { recursive: true });
  }
  createShortcut(path.join(startMenuProdDir, shortcutName));
} catch {}

console.log('VM shortcut setup complete!');
