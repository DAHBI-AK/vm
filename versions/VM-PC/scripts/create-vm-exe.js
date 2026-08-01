const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const iconPng = path.join(assetsDir, 'icon.png');
const vmIconPng = path.join(assetsDir, 'vm-icon.png');
const iconIco = path.join(assetsDir, 'icon.ico');
const launcherCs = path.join(__dirname, 'launcher.cs');
const outputExe = path.join(rootDir, 'VM.exe');

const cscCandidates = [
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
];

function runPowerShell(scriptBody) {
  const scriptPath = path.join(__dirname, '_create-exe-temp.ps1');
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

function resolveSourcePng() {
  if (fs.existsSync(vmIconPng)) {
    return vmIconPng;
  }
  if (fs.existsSync(iconPng)) {
    return iconPng;
  }
  return null;
}

function buildSquareIcon() {
  const sourcePng = resolveSourcePng();
  if (!sourcePng) {
    return false;
  }

  const script = `
Add-Type -AssemblyName System.Drawing
$srcPath = '${sourcePng.replace(/'/g, "''")}'
$icoPath = '${iconIco.replace(/'/g, "''")}'
$size = 256
$src = [System.Drawing.Image]::FromFile($srcPath)
$canvas = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::FromArgb(5, 7, 13))
$ratio = [Math]::Min($size / $src.Width, $size / $src.Height)
$drawW = [int]($src.Width * $ratio * 0.92)
$drawH = [int]($src.Height * $ratio * 0.92)
$x = [int](($size - $drawW) / 2)
$y = [int](($size - $drawH) / 2)
$graphics.DrawImage($src, $x, $y, $drawW, $drawH)
$icon = [System.Drawing.Icon]::FromHandle($canvas.GetHicon())
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$graphics.Dispose()
$canvas.Dispose()
$src.Dispose()
$icon.Dispose()
Write-Output 'ICON_OK'
`;

  try {
    const output = runPowerShell(script);
    return output.includes('ICON_OK') && fs.existsSync(iconIco);
  } catch (error) {
    console.warn('[launcher] Icon build failed:', error.message);
    return false;
  }
}

function findCsc() {
  return cscCandidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function buildExe() {
  if (process.platform !== 'win32') {
    return false;
  }

  if (!fs.existsSync(launcherCs)) {
    console.warn('[launcher] launcher.cs missing.');
    return false;
  }

  buildSquareIcon();

  const csc = findCsc();
  if (!csc) {
    console.warn('[launcher] csc.exe not found.');
    return false;
  }

  const refs = [
    'System.dll',
    'System.Windows.Forms.dll'
  ].map((ref) => `/reference:${ref}`);

  const args = [
    '/nologo',
    '/target:winexe',
    `/out:${outputExe}`,
    '/optimize+',
    ...refs
  ];

  if (fs.existsSync(iconIco) && fs.statSync(iconIco).size > 100) {
    args.push(`/win32icon:${iconIco}`);
  }

  args.push(launcherCs);

  const tempExe = path.join(rootDir, 'VM.build.exe');

  try {
    const buildArgs = args.map((arg) => (arg === `/out:${outputExe}` ? `/out:${tempExe}` : arg));
    execFileSync(csc, buildArgs, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8'
    });

    if (!fs.existsSync(tempExe)) {
      return false;
    }

    try {
      if (fs.existsSync(outputExe)) {
        fs.unlinkSync(outputExe);
      }
      fs.renameSync(tempExe, outputExe);
    } catch {
      fs.copyFileSync(tempExe, outputExe);
      try {
        fs.unlinkSync(tempExe);
      } catch {
        // ignore
      }
    }

    return fs.existsSync(outputExe);
  } catch (error) {
    const details = error.stderr || error.stdout || error.message;
    console.warn('[launcher] VM.exe build failed:', details);
    try {
      if (fs.existsSync(tempExe)) {
        fs.unlinkSync(tempExe);
      }
    } catch {
      // ignore
    }
    return false;
  }
}

function main() {
  if (buildExe()) {
    console.log(`[launcher] VM.exe created: ${outputExe}`);
    return;
  }
  console.warn('[launcher] VM.exe was not created. Use VM.lnk instead.');
}

main();
