const fs = require('fs');
const path = require('path');
const https = require('https');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const MIN_BINARY_SIZE = 1024 * 1024;

const binDir = path.join(__dirname, '..', 'bin');
const ytDlpPath = path.join(binDir, 'yt-dlp.exe');

function isValidBinary(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size >= MIN_BINARY_SIZE;
  } catch {
    return false;
  }
}

function downloadYtDlp() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const tempPath = `${ytDlpPath}.download`;
    const file = fs.createWriteStream(tempPath);

    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`فشل تحميل yt-dlp (HTTP ${response.statusCode})`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            try {
              if (!isValidBinary(tempPath)) {
                fs.unlinkSync(tempPath);
                reject(new Error('ملف yt-dlp المحمّل غير صالح'));
                return;
              }

              if (fs.existsSync(ytDlpPath)) {
                fs.unlinkSync(ytDlpPath);
              }

              fs.renameSync(tempPath, ytDlpPath);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      }).on('error', reject);
    };

    request(YTDLP_URL);
  });
}

async function main() {
  if (isValidBinary(ytDlpPath)) {
    console.log('✅ yt-dlp موجود بالفعل');
    return;
  }

  if (fs.existsSync(ytDlpPath)) {
    fs.unlinkSync(ytDlpPath);
  }

  console.log('جاري تحميل yt-dlp...');
  await downloadYtDlp();
  console.log('✅ تم تحميل yt-dlp بنجاح!');
}

main().catch((error) => {
  console.error('❌ خطأ في تحميل yt-dlp:', error.message);
  process.exit(1);
});
