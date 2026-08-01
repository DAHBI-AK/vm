const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const downloadsDir = path.join(__dirname, 'downloads');
const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

function getYtDlpBaseArgs(url = '') {
  const args = ['--no-update', '--no-warnings', '--no-check-certificates', '--geo-bypass'];
  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }
  return args;
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => stdout += d.toString());
    child.stderr.on('data', (d) => stderr += d.toString());
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function parseFormats(formats = []) {
  const validFormats = formats.filter(f => f.url || f.manifest_url || f.format_id);
  const formatsWithVideo = validFormats.filter(f => f.vcodec && f.vcodec !== 'none');
  const availableHeights = [...new Set(formatsWithVideo.map(f => f.height).filter(Boolean))].sort((a, b) => b - a);

  return {
    hasVideoFormats: formatsWithVideo.length > 0,
    availableHeights: availableHeights.length > 0 ? availableHeights : [1080, 720, 480],
    rawFormats: validFormats
  };
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const reqUrl = req.url.split('?')[0];

  // API Endpoints
  if (req.method === 'POST' && reqUrl === '/api/video-info') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'الرابط مطلوب' }));
        }

        const args = [...getYtDlpBaseArgs(url), '--dump-single-json', '--no-playlist', url];
        const rawOutput = await runYtDlp(args);
        const info = JSON.parse(rawOutput);

        const parsed = parseFormats(info.formats || []);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          title: info.title || 'فيديو بدون عنوان',
          uploader: info.uploader || info.channel || 'VIPD.SHOP Engine',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          description: info.description || '',
          url: url,
          availableHeights: parsed.availableHeights,
          formats: parsed.rawFormats
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message || 'تعذر جلب معلومات الفيديو' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && reqUrl === '/api/download') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, height = 'best', type = 'video-audio', filename, format = 'mp4' } = JSON.parse(body || '{}');
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'الرابط مطلوب' }));
        }

        const timestamp = Date.now();
        const safeName = (filename || 'video').replace(/[^a-zA-Z0-9_-]/g, '_');
        const outFilename = `${safeName}_${timestamp}.${type === 'audio' ? 'mp3' : format}`;
        const outPath = path.join(downloadsDir, outFilename);

        let formatSelector = 'bestvideo+bestaudio/best';
        if (type === 'audio') {
          formatSelector = 'bestaudio/best';
        } else if (height && height !== 'best') {
          formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
        }

        const args = [
          ...getYtDlpBaseArgs(url),
          '-f', formatSelector,
          '-o', outPath,
          url
        ];

        if (type === 'audio') {
          args.push('-x', '--audio-format', 'mp3');
        }

        await runYtDlp(args);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          filename: outFilename,
          path: `/downloads/${outFilename}`,
          fullPath: outPath
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message || 'تعذر التحميل' }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n==========================================`);
  console.log(` VIPD.SHOP Web Downloader is Running!`);
  console.log(` Access at: ${url}`);
  console.log(`==========================================\n`);
  
  try {
    const { exec } = require('child_process');
    exec(`start ${url}`);
  } catch (err) {
    // ignore
  }
});
