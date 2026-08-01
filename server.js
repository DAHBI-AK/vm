const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const open = require('open');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
const ffmpegStatic = require('ffmpeg-static');
const downloadsDir = path.join(__dirname, 'downloads');

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

function getYtDlpBaseArgs(url = '') {
  const args = ['--no-update', '--no-warnings', '--no-check-certificates', '--geo-bypass'];
  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }
  if (ffmpegStatic) {
    args.push('--ffmpeg-location', ffmpegStatic);
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

// REAL Video Info Endpoint
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'الرابط مطلوب' });

    const args = [...getYtDlpBaseArgs(url), '--dump-single-json', '--no-playlist', url];
    const rawOutput = await runYtDlp(args);
    const info = JSON.parse(rawOutput);

    const parsed = parseFormats(info.formats || []);
    res.json({
      title: info.title || 'فيديو بدون عنوان',
      uploader: info.uploader || info.channel || 'VIPD.SHOP Engine',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      description: info.description || '',
      url: url,
      availableHeights: parsed.availableHeights,
      formats: parsed.rawFormats
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'تعذر جلب معلومات الفيديو' });
  }
});

// REAL Download Endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url, height = 'best', type = 'video-audio', filename, clipStart, clipEnd, format = 'mp4' } = req.body;
    if (!url) return res.status(400).json({ error: 'الرابط مطلوب' });

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
      '--merge-output-format', type === 'audio' ? 'mp3' : 'mp4',
      '-o', outPath,
      url
    ];

    if (type === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    }

    await runYtDlp(args);

    const downloadUrl = `/downloads/${outFilename}`;
    res.json({
      success: true,
      filename: outFilename,
      path: downloadUrl,
      fullPath: outPath
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'تعذر التحميل' });
  }
});

// App Health
app.get('/api/status', (req, res) => {
  res.json({
    ytDlp: fs.existsSync(ytDlpPath),
    ffmpeg: !!ffmpegStatic && fs.existsSync(ffmpegStatic),
    status: 'ready'
  });
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n==========================================`);
  console.log(` VIPD.SHOP Real Web Downloader is Running!`);
  console.log(` Access at: ${url}`);
  console.log(`==========================================\n`);
  
  try {
    open(url);
  } catch (err) {
    // ignore
  }
});
