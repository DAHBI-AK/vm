const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const FILE_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const TARGET = path.join(BIN_DIR, FILE_NAME);
const DOWNLOAD_URL = process.platform === 'win32'
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const MIN_SIZE = process.platform === 'win32' ? 500_000 : 2_000_000;

function isValidBinary(filePath) {
  try {
    return fs.statSync(filePath).size >= MIN_SIZE;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tempPath = `${dest}.download`;
    const file = fs.createWriteStream(tempPath);
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
          reject(new Error(`فشل تحميل yt-dlp (HTTP ${response.statusCode})`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(tempPath, dest);
              if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
              resolve(dest);
            } catch (err) {
              reject(err);
            }
          });
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        reject(err);
      });
    };
    request(url);
  });
}

async function ensureYtDlp() {
  const envPath = String(process.env.YT_DLP_PATH || '').trim();
  if (envPath && isValidBinary(envPath)) return envPath;
  if (isValidBinary('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  if (isValidBinary('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  if (isValidBinary(TARGET)) return TARGET;
  console.log('[yt-dlp] downloading', DOWNLOAD_URL);
  await downloadFile(DOWNLOAD_URL, TARGET);
  if (!isValidBinary(TARGET)) throw new Error('فشل حفظ yt-dlp');
  console.log('[yt-dlp] ready', TARGET);
  return TARGET;
}

module.exports = { ensureYtDlp, TARGET };

if (require.main === module) {
  ensureYtDlp().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
