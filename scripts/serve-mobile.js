const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || process.env.VM_MOBILE_PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..');
const IS_CLOUD = !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.VM_CLOUD);
const DOWNLOADS_DIR = process.env.VM_DOWNLOADS_DIR
  || (IS_CLOUD ? path.join(os.tmpdir(), 'vm-downloads') : path.join(os.homedir(), 'Downloads', 'VM'));

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg'
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readJsonBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        req.destroy();
        reject(new Error('طلب كبير جداً'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('بيانات JSON غير صالحة'));
      }
    });
    req.on('error', reject);
  });
}

function isValidBinary(filePath, minSize = 1024) {
  try {
    return fs.statSync(filePath).size >= minSize;
  } catch {
    return false;
  }
}

function resolveYtDlpPath() {
  const candidates = [
    process.env.YT_DLP_PATH,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(PUBLIC_DIR, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'),
    path.join(PUBLIC_DIR, 'bin', 'yt-dlp.exe'),
    path.join(PUBLIC_DIR, 'bin', 'yt-dlp'),
    path.join(PUBLIC_DIR, 'dist', 'VM-Portable', 'bin', 'yt-dlp.exe'),
    path.join(PUBLIC_DIR, 'dist', 'VM-Portable', 'bin', 'yt-dlp')
  ].filter(Boolean);
  return candidates.find((file) => isValidBinary(file, 50_000)) || null;
}

function ensureDownloadsDir() {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  return DOWNLOADS_DIR;
}

function resolveOutputDir(requestedPath) {
  const fallback = ensureDownloadsDir();
  const raw = String(requestedPath || '').trim();
  if (!raw || raw === 'B:\\' || raw === 'B:') {
    return fallback;
  }
  try {
    const resolved = path.resolve(raw);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
    fs.mkdirSync(resolved, { recursive: true });
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    // ignore invalid custom paths
  }
  return fallback;
}

function fileDownloadUrl(filename, dir) {
  const query = dir && path.resolve(dir) !== path.resolve(DOWNLOADS_DIR)
    ? `?dir=${encodeURIComponent(dir)}`
    : '';
  return `/api/file/${encodeURIComponent(filename)}${query}`;
}

function readOsClipboard() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve('');
      return;
    }
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      'try { Get-Clipboard -Raw } catch { "" }'
    ], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(stdout.replace(/\r\n/g, '\n')));
  });
}

function pickFolderDialog(currentPath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: false, error: 'اختيار المجلد متاح على ويندوز فقط' });
      return;
    }

    const start = (() => {
      try {
        const candidate = String(currentPath || '').trim();
        if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
      } catch {}
      return ensureDownloadsDir();
    })();

    const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'اختر مجلد حفظ التحميلات'
$dialog.SelectedPath = ${JSON.stringify(start)}
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
`;
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: false
    });
    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });
    child.on('error', () => resolve({ success: false, error: 'تعذر فتح نافذة اختيار المجلد' }));
    child.on('close', () => {
      const selected = stdout.trim();
      if (selected && fs.existsSync(selected) && fs.statSync(selected).isDirectory()) {
        resolve({ success: true, path: selected });
        return;
      }
      resolve({ success: false, canceled: true });
    });
  });
}

function resolveOpenTarget(requestedPath) {
  const fallback = ensureDownloadsDir();
  const raw = String(requestedPath || '').trim();
  if (!raw) return { dir: fallback, file: null };

  try {
    const resolved = path.resolve(raw);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        return { dir: path.dirname(resolved), file: resolved };
      }
      if (stat.isDirectory()) {
        return { dir: resolved, file: null };
      }
    }
    const parent = path.dirname(resolved);
    if (fs.existsSync(parent)) {
      return { dir: parent, file: null };
    }
  } catch {
    // ignore invalid paths
  }
  return { dir: fallback, file: null };
}

function openExternalUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return { success: false, error: 'رابط غير صالح' };
  }
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message || 'تعذر فتح الرابط' };
  }
}

let cachedYtDlpVersion = '';

async function getYtDlpVersion(force = false) {
  if (cachedYtDlpVersion && !force) return cachedYtDlpVersion;
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) {
    cachedYtDlpVersion = '';
    return '';
  }
  try {
    const { stdout } = await runProcess(ytDlp, ['--version'], { timeoutMs: 20_000 });
    cachedYtDlpVersion = String(stdout || '').trim().split(/\s+/)[0] || '';
    return cachedYtDlpVersion;
  } catch {
    return cachedYtDlpVersion;
  }
}

function getEngineHealth(extra = {}) {
  return {
    success: true,
    ytDlp: !!resolveYtDlpPath(),
    ffmpeg: !!(ffmpegPath && isValidBinary(ffmpegPath, 1000)),
    downloadsDir: ensureDownloadsDir(),
    version: extra.version || cachedYtDlpVersion || '',
    ...extra
  };
}

async function repairEngine() {
  ensureDownloadsDir();
  const cleaned = clearTempCacheFiles();
  const ytDlp = resolveYtDlpPath();
  let updated = false;
  if (ytDlp) {
    try {
      await runProcess(ytDlp, ['-U'], { timeoutMs: 120_000 });
      updated = true;
    } catch {
      updated = false;
    }
  }
  const version = await getYtDlpVersion(true);
  const ffmpegOk = !!(ffmpegPath && isValidBinary(ffmpegPath, 1000));
  return getEngineHealth({
    success: !!ytDlp && ffmpegOk,
    updated,
    cleaned: cleaned.removed || 0,
    version
  });
}

const previewStreamCache = new Map();
const previewJpegCache = new Map();

function clearTempCacheFiles() {
  previewStreamCache.clear();
  previewJpegCache.clear();
  const dir = ensureDownloadsDir();
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('._vm_')) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
        removed += 1;
      } catch { /* ignore locked temp files */ }
    }
  } catch { /* ignore */ }
  return { success: true, removed };
}

async function getPreviewStreamUrl(videoUrl) {
  const url = String(videoUrl || '').trim();
  if (!url) throw new Error('رابط الفيديو مطلوب');
  const cached = previewStreamCache.get(url);
  if (cached?.url && cached.expires > Date.now()) return cached.url;
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) throw new Error('yt-dlp غير موجود. ضع الملف في مجلد bin');
  const { stdout } = await runProcess(ytDlp, [
    ...ytdlpBaseArgs(url),
    '-f', '18/22/best[ext=mp4][height<=480]/best[height<=360]/worst[ext=mp4]/best',
    '-g',
    url
  ], { timeoutMs: 90_000 });
  const streamUrl = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
  if (!streamUrl) throw new Error('تعذر الحصول على رابط البث للمعاينة');
  previewStreamCache.set(url, { url: streamUrl, expires: Date.now() + 5 * 60 * 1000 });
  return streamUrl;
}

async function extractPreviewJpeg(videoUrl, timeSec) {
  const t = Math.max(0, Math.round(Number(timeSec) || 0));
  const cacheKey = `${videoUrl}|${t}`;
  const hit = previewJpegCache.get(cacheKey);
  if (hit?.buf?.length > 500 && hit.expires > Date.now()) return hit.buf;
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) throw new Error('ffmpeg غير متوفر');
  const streamUrl = await getPreviewStreamUrl(videoUrl);
  const tmp = path.join(os.tmpdir(), `vm-clip-prev-${Date.now()}-${t}.jpg`);
  const attempts = [
    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', String(t), '-i', streamUrl, '-frames:v', '1', '-an', '-vf', 'scale=640:-2', '-q:v', '3', tmp],
    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', streamUrl, '-ss', String(t), '-frames:v', '1', '-an', '-vf', 'scale=640:-2', '-q:v', '3', tmp]
  ];
  try {
    let lastErr = null;
    for (const args of attempts) {
      try {
        await runProcess(ffmpegPath, args, { timeoutMs: 60_000 });
        if (fs.existsSync(tmp) && fs.statSync(tmp).size >= 400) {
          lastErr = null;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr || !fs.existsSync(tmp) || fs.statSync(tmp).size < 400) {
      throw lastErr || new Error('تعذر استخراج لقطة المعاينة');
    }
    const buf = fs.readFileSync(tmp);
    previewJpegCache.set(cacheKey, { buf, expires: Date.now() + 3 * 60 * 1000 });
    if (previewJpegCache.size > 64) {
      const oldest = previewJpegCache.keys().next().value;
      previewJpegCache.delete(oldest);
    }
    return buf;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function openFolderInExplorer(requestedPath) {
  const { dir, file } = resolveOpenTarget(requestedPath);
  fs.mkdirSync(dir, { recursive: true });

  if (process.platform === 'win32') {
    const args = file ? ['/select,', file] : [dir];
    spawn('explorer.exe', args, { detached: true, stdio: 'ignore' }).unref();
    return { success: true, path: file || dir };
  }

  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [file || dir], { detached: true, stdio: 'ignore' }).unref();
  return { success: true, path: file || dir };
}

function sanitizeFilename(name, fallback = 'vm-file') {
  let safe = String(name || fallback).trim() || fallback;
  safe = safe.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\.+$/, '');
  safe = safe.replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return safe || fallback;
}

function resolveNodeRuntime() {
  const candidates = [
    process.execPath,
    path.join(PUBLIC_DIR, 'bin', 'node.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe')
  ];
  return candidates.find((file) => file && /\.exe$/i.test(file) && fs.existsSync(file)) || null;
}

function friendlyYtDlpError(raw) {
  const text = String(raw || '');
  if (/sign in to confirm|not a bot|bot/i.test(text)) {
    return 'يوتيوب طلب تأكيد. أعد المحاولة بعد ثوانٍ أو حدّث yt-dlp';
  }
  if (/403|forbidden/i.test(text)) {
    return 'الرابط محظور مؤقتاً (403). أعد المحاولة';
  }
  if (/requested format is not available|format is not available/i.test(text)) {
    return 'الجودة المطلوبة غير متاحة. جرّب جودة أخرى أو أقصى جودة';
  }
  if (/ffmpeg/i.test(text) && /not found|failed/i.test(text)) {
    return 'فشل دمج الفيديو. تأكد من توفر ffmpeg';
  }
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.slice(-400) || 'فشل التحميل';
}

function formatSectionTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const whole = Math.floor(secs);
  const millis = Math.round((secs - whole) * 1000);
  const secStr = millis > 0
    ? `${String(whole).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
    : String(whole).padStart(2, '0');
  return `${hours}:${String(minutes).padStart(2, '0')}:${secStr}`;
}

function getVideoSelector(height, videoOnly) {
  if (!height || height === 'best') {
    return videoOnly
      ? 'bestvideo[vcodec!=none]/bestvideo*/bestvideo'
      : 'bestvideo+bestaudio/bestvideo*+bestaudio/best';
  }
  const n = Number(height);
  if (!Number.isFinite(n) || n <= 0) {
    return videoOnly ? 'bestvideo[vcodec!=none]/bestvideo' : 'bestvideo+bestaudio/best';
  }
  if (videoOnly) {
    return `bestvideo[height<=${n}][vcodec!=none]/bestvideo[height<=${n}]/bestvideo`;
  }
  if (n >= 1440) {
    return `bestvideo[height<=${n}]+bestaudio/best[height<=${n}]`;
  }
  return `bestvideo[height<=${n}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${n}]+bestaudio/best[height<=${n}]`;
}

function runProcess(bin, args, { timeoutMs = 8 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('انتهت مهلة العملية'));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(friendlyYtDlpError(stderr || stdout || `فشل الأمر (رمز ${code})`)));
    });
  });
}

let downloadSpeedOptions = { turbo: false, speedLimit: '', retries: 0 };

function ytdlpBaseArgs(url = '') {
  const turbo = downloadSpeedOptions.turbo === true;
  const retryCount = Number(downloadSpeedOptions.retries) > 0
    ? String(downloadSpeedOptions.retries)
    : (turbo ? '12' : '8');
  const args = [
    '--no-update',
    '--no-warnings',
    '--no-check-certificates',
    '--geo-bypass',
    '--no-playlist',
    '--no-mtime',
    '--retries', retryCount,
    '--fragment-retries', retryCount,
    '--concurrent-fragments', turbo ? '8' : '4'
  ];
  const limit = String(downloadSpeedOptions.speedLimit || '').trim();
  if (limit && limit !== 'unlimited') {
    args.push('--limit-rate', limit);
  }
  if (turbo) {
    args.push('--socket-timeout', '20', '--http-chunk-size', '10M');
  }
  if (ffmpegPath && isValidBinary(ffmpegPath, 1000)) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
  const nodeRuntime = resolveNodeRuntime();
  if (nodeRuntime) {
    args.push('--js-runtimes', `node:${nodeRuntime}`);
  }
  if (/youtube\.com|youtu\.be/i.test(url)) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }
  return args;
}

function ytdlpChannelArgs(url = '') {
  downloadSpeedOptions.turbo = false;
  downloadSpeedOptions.speedLimit = '';
  downloadSpeedOptions.retries = 0;
  return ytdlpBaseArgs(url).filter((arg) => arg !== '--no-playlist');
}

function normalizeChannelCheckUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) throw new Error('رابط القناة مطلوب');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const path = u.pathname.replace(/\/+$/, '') || '/';
      const isChannelPath =
        path.startsWith('/@') ||
        path.startsWith('/channel/') ||
        path.startsWith('/c/') ||
        path.startsWith('/user/');
      const alreadyTab = /\/(videos|streams|shorts|releases|playlists)$/i.test(path);
      if (isChannelPath && !alreadyTab) {
        u.pathname = `${path}/videos`;
        u.search = '';
        u.hash = '';
        return u.toString();
      }
    }
  } catch {
    /* keep original */
  }
  return url;
}

function pickChannelDisplayName(candidates, fallbackUrl) {
  for (const raw of candidates) {
    const s = String(raw || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!s || s === 'NA') continue;
    const cleaned = s
      .replace(/^(Uploads from|Videos from|Streams from)\s+/i, '')
      .replace(/\s*[-–—|]\s*(Videos|Streams|Shorts|Live|Releases|Playlists|Uploads|Home|Featured|فيديوهات|مقاطع|مباشر)\s*$/i, '')
      .trim();
    if (!cleaned || /^(videos|streams|shorts|live|uploads|home|featured|na)$/i.test(cleaned)) continue;
    if (/^UC[\w-]{20,}$/i.test(cleaned)) continue;
    return cleaned;
  }
  try {
    const u = new URL(fallbackUrl);
    const m = u.pathname.match(/\/@([^/]+)/) || u.pathname.match(/\/c\/([^/]+)/) || u.pathname.match(/\/user\/([^/]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return fallbackUrl;
  }
}

async function fetchChannelUpdates(channelUrl, limit = 8) {
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) {
    throw new Error('yt-dlp غير موجود. ضع الملف في مجلد bin');
  }
  const url = normalizeChannelCheckUrl(channelUrl);
  const max = Math.max(1, Math.min(20, Number(limit) || 8));
  const { stdout } = await runProcess(ytDlp, [
    ...ytdlpChannelArgs(url),
    '--flat-playlist',
    '--skip-download',
    '--playlist-end', String(max),
    '--print', '%(id)s\t%(title)s\t%(webpage_url)s\t%(channel)s\t%(uploader)s\t%(playlist_uploader)s\t%(playlist_channel)s\t%(playlist_title)s',
    url
  ], { timeoutMs: 120_000 });

  let channelName = '';
  const entries = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('\t')) continue;
    const parts = trimmed.split('\t');
    const id = parts[0];
    const title = parts[1];
    const webpageUrl = parts[2];
    if (!id || id === 'NA') continue;
    if (!channelName) {
      channelName = pickChannelDisplayName([parts[3], parts[4], parts[5], parts[6], parts[7]], url);
    }
    let videoUrl = webpageUrl && webpageUrl !== 'NA' ? webpageUrl : '';
    if (!videoUrl) {
      videoUrl = /^[A-Za-z0-9_-]{6,}$/.test(id)
        ? `https://www.youtube.com/watch?v=${id}`
        : url;
    }
    entries.push({
      id: String(id),
      title: title && title !== 'NA' ? title : String(id),
      url: videoUrl
    });
  }
  if (!channelName) channelName = pickChannelDisplayName([], url);
  return { channelName, entries, checkedUrl: url };
}

async function fetchVideoInfo(url) {
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) {
    throw new Error('yt-dlp غير موجود. ضع الملف في مجلد bin');
  }
  const { stdout } = await runProcess(ytDlp, [
    ...ytdlpBaseArgs(url),
    '--dump-single-json',
    url
  ], { timeoutMs: 90_000 });

  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('تعذر قراءة معلومات الفيديو');
  }
  const info = JSON.parse(stdout.slice(start, end + 1));
  const heights = [...new Set((info.formats || [])
    .map((fmt) => Number(fmt.height))
    .filter((h) => Number.isFinite(h) && h > 0))]
    .sort((a, b) => a - b);

  let thumbnail = '';
  if (Array.isArray(info.thumbnails) && info.thumbnails.length) {
    const best = [...info.thumbnails].reverse().find((item) => item?.url);
    thumbnail = best?.url || '';
  }
  if (!thumbnail) thumbnail = info.thumbnail || '';
  if (/ytimg\.com/i.test(thumbnail)) {
    thumbnail = thumbnail
      .replace(/\/hqdefault\.jpg/i, '/maxresdefault.jpg')
      .replace(/\/mqdefault\.jpg/i, '/maxresdefault.jpg')
      .replace(/\/sddefault\.jpg/i, '/maxresdefault.jpg');
  }

  return {
    success: true,
    url: info.webpage_url || url,
    title: info.title || 'فيديو',
    uploader: info.uploader || info.channel || '',
    thumbnail,
    duration: Number(info.duration) || 0,
    availableHeights: heights.length ? heights : [360, 720, 1080]
  };
}

function findNewestFile(dir, prefix, preferExt = '') {
  try {
    const files = fs.readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && !/\.(part|ytdl|temp)$/i.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        return { full, name, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (preferExt) {
      const ext = preferExt.toLowerCase();
      const preferred = files.find((file) => file.name.toLowerCase().endsWith(ext));
      if (preferred) return preferred;
    }
    return files[0] || null;
  } catch {
    return null;
  }
}

function getAudioFormatSelector(abrRaw) {
  if (!abrRaw || abrRaw === 'best') return 'bestaudio/bestaudio*/best';
  const abr = Number(abrRaw);
  if (Number.isFinite(abr) && abr > 0) return `bestaudio[abr<=${abr}]/bestaudio/best`;
  return 'bestaudio/bestaudio*/best';
}

function getMp3AudioQualityArg(abrRaw) {
  if (!abrRaw || abrRaw === 'best') return '0';
  const abr = Number(abrRaw);
  if (Number.isFinite(abr) && abr > 0) return `${Math.round(abr)}K`;
  return '0';
}

async function ensureVideoAudioFile(inputPath, outputPath, audioEnhance = false) {
  if (!inputPath || !fs.existsSync(inputPath)) return null;
  const tryCopy = () => {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    return outputPath;
  };
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
    return tryCopy();
  }
  const tempOut = path.join(path.dirname(outputPath), `._vm_av_${Date.now()}.mp4`);
  const audioArgs = audioEnhance
    ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k']
    : ['-c:a', 'aac', '-b:a', '160k'];
  try {
    await runProcess(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-map', '0:v:0?', '-map', '0:a:0?',
      '-c:v', 'copy',
      ...audioArgs,
      '-movflags', '+faststart',
      tempOut
    ], { timeoutMs: 8 * 60 * 1000 });
    if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 1000) {
      try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
      return tryCopy();
    }
    try {
      if (fs.existsSync(outputPath) && path.resolve(outputPath) !== path.resolve(tempOut)) {
        fs.unlinkSync(outputPath);
      }
    } catch { /* ignore */ }
    fs.renameSync(tempOut, outputPath);
    try {
      if (path.resolve(inputPath) !== path.resolve(outputPath)) fs.unlinkSync(inputPath);
    } catch { /* ignore */ }
    return outputPath;
  } catch {
    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    return tryCopy();
  }
}

async function ensureVideoOnlyFile(inputPath, outputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return null;
  const tempOut = path.join(
    path.dirname(outputPath),
    `._vm_vo_${Date.now()}.mp4`
  );
  const tryCopy = () => {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    return outputPath;
  };
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
    return tryCopy();
  }
  const runStrip = async (videoCodec) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-an', '-movflags', '+faststart'];
    if (videoCodec === 'copy') args.splice(6, 0, '-c:v', 'copy');
    else args.splice(6, 0, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    args.push(tempOut);
    await runProcess(ffmpegPath, args, { timeoutMs: 8 * 60 * 1000 });
  };
  try {
    try {
      await runStrip('copy');
    } catch {
      await runStrip('encode');
    }
    if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 1000) {
      try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
      return tryCopy();
    }
    try {
      if (fs.existsSync(outputPath) && path.resolve(outputPath) !== path.resolve(tempOut)) {
        fs.unlinkSync(outputPath);
      }
    } catch { /* ignore */ }
    fs.renameSync(tempOut, outputPath);
    try {
      if (path.resolve(inputPath) !== path.resolve(outputPath)) fs.unlinkSync(inputPath);
    } catch { /* ignore */ }
    return outputPath;
  } catch {
    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    return tryCopy();
  }
}

async function ensureMp3File(inputPath, outputPath, abrRaw) {
  if (!inputPath || !fs.existsSync(inputPath)) return null;
  if (/\.mp3$/i.test(inputPath)) {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    return outputPath;
  }
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }
  const bitrate = getMp3AudioQualityArg(abrRaw);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn'];
  if (bitrate === '0') args.push('-q:a', '2');
  else args.push('-b:a', bitrate);
  args.push(outputPath);
  await runProcess(ffmpegPath, args, { timeoutMs: 8 * 60 * 1000 });
  try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
  return fs.existsSync(outputPath) ? outputPath : null;
}

function youtubeVideoIdFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, '');
    if (host === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0];
    if (/youtube\.com|youtube-nocookie\.com/i.test(host)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  return '';
}

function thumbnailUrlCandidates(videoUrl, thumbnailUrl) {
  const urls = [];
  let raw = String(thumbnailUrl || '').trim();
  raw = raw
    .replace(/i\.ytimg\.com\/vi_webp\//i, 'i.ytimg.com/vi/')
    .replace(/\/(maxresdefault|sddefault|hqdefault|mqdefault|default)\.webp(?:\?.*)?$/i, '/$1.jpg');
  if (/^https?:\/\//i.test(raw)) {
    urls.push(raw);
    urls.push(raw.replace(/\/(hq|mq|sd)?default\.jpg/i, '/maxresdefault.jpg'));
  }
  const id = youtubeVideoIdFromUrl(videoUrl);
  if (id) {
    ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', '0'].forEach((name) => {
      urls.push(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    });
  }
  return [...new Set(urls.filter((item) => /^https?:\/\//i.test(item)))];
}

function downloadRemoteFile(url, outputPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('تعذر تحميل الصورة (تحويلات كثيرة)'));
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('رابط الصورة غير صالح'));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://www.youtube.com/'
      }
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const next = new URL(response.headers.location, url).toString();
        response.resume();
        downloadRemoteFile(next, outputPath, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`فشل تحميل الصورة (HTTP ${response.statusCode})`));
        return;
      }
      const file = fs.createWriteStream(outputPath);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve({ success: true, path: outputPath })));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('انتهت مهلة تحميل الصورة'));
    });
  });
}

async function convertImageWithFfmpeg(inputPath, outputPath, fmt) {
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
    if (inputPath !== outputPath) {
      fs.copyFileSync(inputPath, outputPath);
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    return outputPath;
  }
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath];
  if (fmt === 'png') args.push('-vcodec', 'png');
  else if (fmt === 'webp') args.push('-vcodec', 'libwebp', '-quality', '92');
  else args.push('-q:v', '2');
  args.push(outputPath);
  try {
    await runProcess(ffmpegPath, args, { timeoutMs: 60_000 });
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      if (inputPath !== outputPath) {
        try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
      }
      return outputPath;
    }
  } catch {
    /* keep original */
  }
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.copyFileSync(inputPath, outputPath);
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return outputPath;
  }
  return inputPath;
}

async function downloadThumbnailWithYtDlp(url, outDir, fmt = 'jpg') {
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) return null;
  const prefix = `._vm_thumb_${Date.now()}`;
  const convertTo = ['png', 'jpg', 'webp'].includes(fmt) ? fmt : 'jpg';
  try {
    await runProcess(ytDlp, [
      ...ytdlpBaseArgs(url),
      '--skip-download',
      '--write-thumbnail',
      '--convert-thumbnails', convertTo,
      '-o', path.join(outDir, `${prefix}.%(ext)s`),
      url
    ], { timeoutMs: 90_000 });
  } catch {
    return null;
  }
  const found = findNewestFile(outDir, prefix);
  if (found && fs.statSync(found.full).size > 500) return found.full;
  return null;
}

async function cropImageWithFfmpeg(inputPath, outputPath, {
  aspectRatio = 'default',
  outputSize = 'original',
  maskShape = 'rect',
  customWidth = 1080,
  customHeight = 1080
} = {}) {
  if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000) || !fs.existsSync(inputPath)) {
    return inputPath;
  }
  const filters = [];
  const cropOption = String(aspectRatio || 'default');
  const shape = String(maskShape || 'rect');
  const size = String(outputSize || 'original');

  if (shape === 'circle' && cropOption !== '1:1') {
    filters.push(`crop='min(iw\\,ih)':'min(iw\\,ih)':(iw-ow)/2:(ih-oh)/2`);
  } else if (cropOption === '1:1') {
    filters.push(`crop='min(iw\\,ih)':'min(iw\\,ih)':(iw-ow)/2:(ih-oh)/2`);
  } else if (cropOption === '9:16') {
    filters.push(`crop='if(gt(iw/ih\\,9/16)\\,ih*9/16\\,iw)':'if(gt(iw/ih\\,9/16)\\,ih\\,iw*16/9)':(iw-ow)/2:(ih-oh)/2`);
  } else if (cropOption === '4:5') {
    filters.push(`crop='if(gt(iw/ih\\,4/5)\\,ih*4/5\\,iw)':'if(gt(iw/ih\\,4/5)\\,ih\\,iw*5/4)':(iw-ow)/2:(ih-oh)/2`);
  } else if (cropOption === '16:9') {
    filters.push(`crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':'if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16)':(iw-ow)/2:(ih-oh)/2`);
  } else if (cropOption === '21:9') {
    filters.push(`crop='if(gt(iw/ih\\,21/9)\\,ih*21/9\\,iw)':'if(gt(iw/ih\\,21/9)\\,ih\\,iw*9/21)':(iw-ow)/2:(ih-oh)/2`);
  }

  const w = Math.max(64, Math.min(7680, Number(customWidth) || 1080));
  const h = Math.max(64, Math.min(7680, Number(customHeight) || 1080));
  if (size === 'custom') {
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
  } else if (size === '720') {
    filters.push('scale=\'if(gt(iw\\,ih)\\,720\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,720)\'');
  } else if (size === '1080') {
    filters.push('scale=\'if(gt(iw\\,ih)\\,1080\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,1080)\'');
  } else if (size === '480') {
    filters.push('scale=\'if(gt(iw\\,ih)\\,480\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,480)\'');
  }

  if (shape === 'circle') {
    filters.push('format=rgba');
    filters.push("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-W/2\\,Y-H/2)\\,min(W\\,H)/2)\\,255\\,0)'");
  } else if (shape === 'rounded') {
    filters.push('format=rgba');
    filters.push("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow(max(0\\,abs(X-W/2)-(W/2-min(W\\,H)/8))\\,2)+pow(max(0\\,abs(Y-H/2)-(H/2-min(W\\,H)/8))\\,2)\\,pow(min(W\\,H)/8\\,2))\\,255\\,0)'");
  }

  if (!filters.length) return inputPath;

  const ext = path.extname(outputPath).toLowerCase();
  const usePng = shape === 'circle' || shape === 'rounded';
  const tempOutput = path.join(
    path.dirname(outputPath),
    `._vm_crop_${Date.now()}${usePng && (ext === '.jpg' || ext === '.jpeg') ? '.png' : (ext || '.png')}`
  );
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vf', filters.join(',')];
  if (usePng) args.push('-vcodec', 'png');
  else if (ext === '.webp') args.push('-vcodec', 'libwebp', '-quality', '92');
  else if (ext === '.jpg' || ext === '.jpeg') args.push('-q:v', '2');
  args.push(tempOutput);

  try {
    await runProcess(ffmpegPath, args, { timeoutMs: 60_000 });
    if (!fs.existsSync(tempOutput) || fs.statSync(tempOutput).size < 200) {
      try { fs.unlinkSync(tempOutput); } catch { /* ignore */ }
      return inputPath;
    }
    const finalOut = usePng && (ext === '.jpg' || ext === '.jpeg')
      ? outputPath.replace(/\.jpe?g$/i, '.png')
      : outputPath;
    try {
      if (fs.existsSync(finalOut) && path.resolve(finalOut) !== path.resolve(tempOutput)) {
        fs.unlinkSync(finalOut);
      }
    } catch { /* ignore */ }
    fs.renameSync(tempOutput, finalOut);
    if (path.resolve(inputPath) !== path.resolve(finalOut)) {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    }
    return finalOut;
  } catch {
    try { fs.unlinkSync(tempOutput); } catch { /* ignore */ }
    return inputPath;
  }
}

async function downloadImageAsset({
  url,
  filename,
  imageMode,
  imageFormat,
  thumbnailUrl,
  frameSeekTime,
  outputDir,
  aspectRatio,
  outputSize,
  maskShape,
  customWidth,
  customHeight
}) {
  const ytDlp = resolveYtDlpPath();
  const outDir = resolveOutputDir(outputDir);
  const fmt = /^(png|jpg|jpeg|webp)$/i.test(String(imageFormat || ''))
    ? String(imageFormat).toLowerCase().replace('jpeg', 'jpg')
    : 'jpg';
  const baseName = sanitizeFilename(filename || 'vm-image');
  const finalName = `${baseName}.${fmt}`;
  const finalPath = path.join(outDir, finalName);

  let converted = finalPath;
  if (imageMode !== 'frame') {
    const tempJpg = path.join(outDir, `._vm_img_${Date.now()}.jpg`);
    let saved = await downloadThumbnailWithYtDlp(url, outDir, fmt);
    if (!saved) {
      for (const thumb of thumbnailUrlCandidates(url, thumbnailUrl)) {
        try {
          await downloadRemoteFile(thumb, tempJpg);
          if (fs.existsSync(tempJpg) && fs.statSync(tempJpg).size > 2500) {
            saved = tempJpg;
            break;
          }
        } catch {
          try { fs.unlinkSync(tempJpg); } catch { /* ignore */ }
        }
      }
    }
    if (!saved) throw new Error('تعذر تحميل غلاف الفيديو الأصلي');
    converted = await convertImageWithFfmpeg(saved, finalPath, fmt);
  } else {
    if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) throw new Error('ffmpeg غير متوفر لاستخراج اللقطة');
    const seek = Math.max(0, Number(frameSeekTime) || 0);
    const jpegBuf = await extractPreviewJpeg(url, seek);
    const tempJpg = path.join(outDir, `._vm_frame_${Date.now()}.jpg`);
    fs.writeFileSync(tempJpg, jpegBuf);
    converted = await convertImageWithFfmpeg(tempJpg, finalPath, fmt);
    if (!converted || !fs.existsSync(converted)) throw new Error('تعذر حفظ اللقطة');
  }

  const needsCrop = (aspectRatio && aspectRatio !== 'default')
    || (outputSize && outputSize !== 'original')
    || (maskShape && maskShape !== 'rect');
  if (needsCrop) {
    converted = await cropImageWithFfmpeg(converted, converted, {
      aspectRatio,
      outputSize,
      maskShape,
      customWidth,
      customHeight
    });
  }

  const outName = path.basename(converted);
  return {
    success: true,
    path: converted,
    filename: outName,
    downloadUrl: fileDownloadUrl(outName, outDir)
  };
}

async function enhanceAudioFile(inputPath, isAudioOnly = false) {
  if (!inputPath || !fs.existsSync(inputPath) || !ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
    return inputPath;
  }
  const ext = path.extname(inputPath).toLowerCase() || (isAudioOnly ? '.mp3' : '.mp4');
  const tempOut = path.join(path.dirname(inputPath), `._vm_ae_${Date.now()}${ext}`);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'];
  if (isAudioOnly || ext === '.mp3') {
    args.push('-q:a', '2');
  } else {
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  }
  args.push(tempOut);
  try {
    await runProcess(ffmpegPath, args, { timeoutMs: 8 * 60 * 1000 });
    if (fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1000) {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
      fs.renameSync(tempOut, inputPath);
    } else {
      try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    }
  } catch {
    try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
  }
  return inputPath;
}

async function downloadWithYtDlp({
  url,
  type,
  height,
  filename,
  mode,
  clipStart,
  clipEnd,
  imageMode,
  imageFormat,
  thumbnailUrl,
  frameSeekTime,
  outputDir,
  aspectRatio,
  outputSize,
  maskShape,
  customWidth,
  customHeight,
  turbo,
  audioEnhance,
  speedLimit,
  retries,
  abr
}) {
  if (mode === 'image') {
    downloadSpeedOptions.turbo = false;
    downloadSpeedOptions.speedLimit = '';
    downloadSpeedOptions.retries = 0;
    return downloadImageAsset({
      url,
      filename,
      imageMode,
      imageFormat,
      thumbnailUrl,
      frameSeekTime,
      outputDir,
      aspectRatio,
      outputSize,
      maskShape,
      customWidth,
      customHeight
    });
  }
  downloadSpeedOptions.turbo = turbo === true;
  downloadSpeedOptions.speedLimit = String(speedLimit || '').trim();
  downloadSpeedOptions.retries = Number(retries) || 0;
  try {
  const ytDlp = resolveYtDlpPath();
  if (!ytDlp) {
    throw new Error('yt-dlp غير موجود. ضع الملف في مجلد bin');
  }

  const outDir = resolveOutputDir(outputDir);
  const baseName = sanitizeFilename(filename || 'vm-download');
  const videoOnly = type === 'video-only';
  const isAudio = type === 'audio';
  const isClip = mode === 'clip';
  const ext = isAudio ? 'mp3' : 'mp4';
  const finalName = `${baseName}.${ext}`;
  const finalPath = path.join(outDir, finalName);
  const tempPrefix = `._vm_dl_${Date.now()}`;
  const tempPattern = path.join(outDir, `${tempPrefix}.%(ext)s`);

  if (isClip) {
    const start = Number(clipStart);
    const end = Number(clipEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('نطاق القص غير صالح. تأكد أن وقت النهاية أكبر من البداية');
    }
    if (!ffmpegPath || !isValidBinary(ffmpegPath, 1000)) {
      throw new Error('ffmpeg غير متوفر لقص المقاطع');
    }
    const duration = Math.max(0.1, end - start);

    if (isAudio) {
      const audioSelector = getAudioFormatSelector(abr);
      const mp3Quality = getMp3AudioQualityArg(abr);
      try {
        const { stdout } = await runProcess(ytDlp, [...ytdlpBaseArgs(url), '-f', audioSelector, '-g', url], { timeoutMs: 90_000 });
        const streamUrl = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
        if (!streamUrl) throw new Error('تعذر الحصول على رابط الصوت');
        const ffArgs = [
          '-hide_banner', '-nostdin', '-y',
          '-user_agent', 'Mozilla/5.0',
          '-referer', 'https://www.youtube.com/',
          '-ss', String(start), '-i', streamUrl, '-t', String(duration),
          '-vn'
        ];
        if (audioEnhance) ffArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
        if (!abr || abr === 'best') ffArgs.push('-c:a', 'libmp3lame', '-q:a', '0');
        else ffArgs.push('-c:a', 'libmp3lame', '-b:a', `${Number(abr) || 192}k`);
        ffArgs.push(finalPath);
        await runProcess(ffmpegPath, ffArgs, { timeoutMs: 8 * 60 * 1000 });
        if (fs.existsSync(finalPath)) {
          return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
        }
      } catch {
        // fallback below
      }

      try {
        await runProcess(ytDlp, [
          ...ytdlpBaseArgs(url),
          '--newline',
          '-f', audioSelector,
          '-x', '--audio-format', 'mp3',
          '--audio-quality', mp3Quality,
          '--download-sections', `*${formatSectionTime(start)}-${formatSectionTime(end)}`,
          '-o', tempPattern,
          url
        ]);
        const found = findNewestFile(outDir, tempPrefix, '.mp3') || findNewestFile(outDir, tempPrefix);
        if (found) {
          fs.copyFileSync(found.full, finalPath);
          try { fs.unlinkSync(found.full); } catch { /* ignore */ }
          if (audioEnhance) await enhanceAudioFile(finalPath, true);
          return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
        }
      } catch {
        // last fallback: full audio then cut
      }

      await runProcess(ytDlp, [
        ...ytdlpBaseArgs(url),
        '--newline',
        '-f', audioSelector,
        '-x', '--audio-format', 'mp3',
        '--audio-quality', mp3Quality,
        '-o', tempPattern,
        url
      ]);
      const source = findNewestFile(outDir, tempPrefix, '.mp3') || findNewestFile(outDir, tempPrefix);
      if (!source) throw new Error('تعذر تحميل صوت المقطع');
      await runProcess(ffmpegPath, [
        '-hide_banner', '-nostdin', '-y',
        '-ss', String(start),
        '-i', source.full,
        '-t', String(duration),
        '-vn',
        ...(audioEnhance ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
        '-c:a', 'libmp3lame',
        ...(!abr || abr === 'best' ? ['-q:a', '0'] : ['-b:a', `${Number(abr) || 192}k`]),
        finalPath
      ]);
      try { fs.unlinkSync(source.full); } catch { /* ignore */ }
      if (!fs.existsSync(finalPath)) throw new Error('تعذر حفظ صوت المقطع');
      return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
    }

    const selector = getVideoSelector(height, videoOnly);
    try {
      const { stdout } = await runProcess(ytDlp, [...ytdlpBaseArgs(url), '-f', selector, '-g', url], { timeoutMs: 90_000 });
      const urls = stdout.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!urls.length) {
        throw new Error('تعذر الحصول على رابط البث');
      }
      const duration = Math.max(0.1, end - start);
      const ffArgs = [
        '-hide_banner', '-nostdin', '-y',
        '-user_agent', 'Mozilla/5.0',
        '-referer', 'https://www.youtube.com/'
      ];
      if (urls.length >= 2 && !videoOnly) {
        ffArgs.push('-ss', String(start), '-i', urls[0], '-ss', String(start), '-i', urls[1], '-t', String(duration), '-map', '0:v:0?', '-map', '1:a:0?');
      } else {
        ffArgs.push('-ss', String(start), '-i', urls[0], '-t', String(duration));
      }
      ffArgs.push('-c:v', 'libx264', '-preset', turbo ? 'veryfast' : 'fast', '-crf', turbo ? '23' : '20');
      if (videoOnly) ffArgs.push('-an');
      else {
        if (audioEnhance) ffArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
        ffArgs.push('-c:a', 'aac', '-b:a', audioEnhance ? '192k' : '160k');
      }
      ffArgs.push('-movflags', '+faststart', finalPath);
      await runProcess(ffmpegPath, ffArgs, { timeoutMs: 8 * 60 * 1000 });
      if (fs.existsSync(finalPath)) {
        return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
      }
    } catch {
      // fallback below
    }

    const sectionArgs = [
      ...ytdlpBaseArgs(url),
      '--newline',
      '-f', selector,
      '--merge-output-format', 'mp4',
      '--download-sections', `*${formatSectionTime(start)}-${formatSectionTime(end)}`,
      '--force-keyframes-at-cuts',
      '-o', tempPattern,
      url
    ];
    try {
      await runProcess(ytDlp, sectionArgs);
      const found = findNewestFile(outDir, tempPrefix);
      if (found) {
        fs.copyFileSync(found.full, finalPath);
        try { fs.unlinkSync(found.full); } catch {}
        if (audioEnhance && !videoOnly) await enhanceAudioFile(finalPath, false);
        return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
      }
    } catch {
      // last fallback: full download then ffmpeg cut
    }

    await runProcess(ytDlp, [
      ...ytdlpBaseArgs(url),
      '--newline',
      '-f', selector,
      '--merge-output-format', 'mp4',
      '-o', tempPattern,
      url
    ]);
    const source = findNewestFile(outDir, tempPrefix);
    if (!source) {
      throw new Error('تعذر تحميل مصدر المقطع');
    }
    await runProcess(ffmpegPath, [
      '-hide_banner', '-nostdin', '-y',
      '-ss', String(start),
      '-i', source.full,
      '-t', String(Math.max(0.1, end - start)),
      '-c:v', 'libx264', '-preset', turbo ? 'veryfast' : 'fast', '-crf', turbo ? '23' : '20',
      ...(videoOnly
        ? ['-an']
        : [
            ...(audioEnhance ? ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'] : []),
            '-c:a', 'aac', '-b:a', audioEnhance ? '192k' : '160k'
          ]),
      '-movflags', '+faststart',
      finalPath
    ]);
    try { fs.unlinkSync(source.full); } catch {}
    if (!fs.existsSync(finalPath)) {
      throw new Error('تعذر حفظ المقطع');
    }
    return { success: true, path: finalPath, filename: finalName, downloadUrl: fileDownloadUrl(finalName, outDir) };
  }

  const attempts = [];
  if (isAudio) {
    const selector = getAudioFormatSelector(abr);
    const audioQuality = getMp3AudioQualityArg(abr);
    attempts.push(['-f', selector, '-x', '--audio-format', 'mp3', '--audio-quality', audioQuality]);
    attempts.push(['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', audioQuality]);
    attempts.push(['-f', 'bestaudio*', '-x', '--audio-format', 'mp3', '--audio-quality', '0']);
  } else if (videoOnly) {
    attempts.push(['-f', getVideoSelector(height, true), '--remux-video', 'mp4']);
    attempts.push(['-f', 'bestvideo[vcodec!=none]/bestvideo', '--remux-video', 'mp4']);
    attempts.push(['-f', 'bestvideo*', '--remux-video', 'mp4']);
  } else {
    attempts.push(['-f', getVideoSelector(height, false), '--merge-output-format', 'mp4']);
    attempts.push(['-f', 'bestvideo+bestaudio/bv*+ba/b', '--merge-output-format', 'mp4']);
    attempts.push(['-f', 'b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4']);
    attempts.push(['-f', 'best', '--merge-output-format', 'mp4']);
  }

  let lastError = null;
  for (const extra of attempts) {
    try {
      await runProcess(ytDlp, [...ytdlpBaseArgs(url), '--newline', '-o', tempPattern, ...extra, url]);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      console.error('[download] attempt failed:', extra.join(' '), err.message);
    }
  }
  if (lastError) {
    throw lastError;
  }

  const found = findNewestFile(outDir, tempPrefix, isAudio ? '.mp3' : '');
  if (!found) {
    throw new Error('تعذر حفظ الملف بعد التحميل');
  }
  if (videoOnly) {
    const silentPath = await ensureVideoOnlyFile(found.full, finalPath);
    if (!silentPath || !fs.existsSync(silentPath)) {
      throw new Error('تعذر حفظ فيديو بدون صوت');
    }
    return {
      success: true,
      path: silentPath,
      filename: path.basename(silentPath),
      downloadUrl: fileDownloadUrl(path.basename(silentPath), outDir)
    };
  }
  if (isAudio) {
    const mp3Path = await ensureMp3File(found.full, finalPath, abr);
    if (!mp3Path || !fs.existsSync(mp3Path)) {
      throw new Error('تعذر تحويل الصوت إلى MP3');
    }
    if (audioEnhance) await enhanceAudioFile(mp3Path, true);
    return {
      success: true,
      path: mp3Path,
      filename: path.basename(mp3Path),
      downloadUrl: fileDownloadUrl(path.basename(mp3Path), outDir)
    };
  }
  const avPath = await ensureVideoAudioFile(found.full, finalPath, audioEnhance);
  if (!avPath || !fs.existsSync(avPath)) {
    throw new Error('تعذر حفظ فيديو مع صوت');
  }
  return {
    success: true,
    path: avPath,
    filename: path.basename(avPath),
    downloadUrl: fileDownloadUrl(path.basename(avPath), outDir)
  };
  } finally {
    downloadSpeedOptions.turbo = false;
    downloadSpeedOptions.speedLimit = '';
    downloadSpeedOptions.retries = 0;
  }
}

function serveStatic(req, res, reqUrl) {
  let pathname = decodeURIComponent(reqUrl.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
  if (['.html', '.js', '.css'].includes(ext)) {
    headers['Cache-Control'] = 'no-store, max-age=0';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

function serveDownloadFile(res, reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const safeName = path.basename(decodeURIComponent(parsed.pathname.replace(/^\/api\/file\//, '')));
  let baseDir = ensureDownloadsDir();
  const customDir = parsed.searchParams.get('dir') || '';
  if (customDir) {
    try {
      const resolved = path.resolve(customDir);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        baseDir = resolved;
      }
    } catch {}
  }
  const filePath = path.resolve(path.join(baseDir, safeName));
  if (!safeName || !filePath.startsWith(path.resolve(baseDir)) || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('File not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '/';
  const method = req.method || 'GET';

  try {
    if (reqUrl.startsWith('/api/file/') && method === 'GET') {
      serveDownloadFile(res, reqUrl);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/clipboard' && (method === 'GET' || method === 'POST')) {
      const text = await readOsClipboard();
      json(res, 200, { success: true, text });
      return;
    }

    if (reqUrl.split('?')[0] === '/api/pick-folder') {
      const body = method === 'POST' ? await readJsonBody(req) : {};
      const result = await pickFolderDialog(body.current || body.path || '');
      json(res, result.success ? 200 : (result.canceled ? 200 : 500), result);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/open-url' && method === 'POST') {
      const body = await readJsonBody(req);
      const result = openExternalUrl(body.url);
      json(res, result.success ? 200 : 400, result);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/open-folder') {
      const body = method === 'POST' ? await readJsonBody(req) : {};
      const queryPath = (() => {
        try {
          return new URL(reqUrl, 'http://localhost').searchParams.get('path') || '';
        } catch {
          return '';
        }
      })();
      const result = openFolderInExplorer(body.path || queryPath);
      json(res, 200, result);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/clear-cache' && method === 'POST') {
      json(res, 200, clearTempCacheFiles());
      return;
    }

    if (reqUrl.split('?')[0] === '/api/repair' && method === 'POST') {
      const result = await repairEngine();
      json(res, result.success ? 200 : 500, result);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/status') {
      const version = await getYtDlpVersion();
      json(res, 200, getEngineHealth({ version }));
      return;
    }

    if (reqUrl.split('?')[0] === '/api/stream-url' && method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body.url || '').trim();
      if (!url) {
        json(res, 400, { success: false, error: 'الرجاء إدخال رابط الفيديو' });
        return;
      }
      const streamUrl = await getPreviewStreamUrl(url);
      json(res, 200, { success: true, url: streamUrl });
      return;
    }

    if (reqUrl.split('?')[0] === '/api/preview-frame' && method === 'GET') {
      const parsed = new URL(reqUrl, 'http://localhost');
      const url = String(parsed.searchParams.get('url') || '').trim();
      const t = Number(parsed.searchParams.get('t') || 0);
      if (!url) {
        json(res, 400, { success: false, error: 'رابط الفيديو مطلوب' });
        return;
      }
      console.log('[preview-frame]', Math.floor(t), url);
      try {
        const buf = await extractPreviewJpeg(url, t);
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-store',
          'Content-Length': buf.length
        });
        res.end(buf);
      } catch (err) {
        console.error('[preview-frame] fail', err.message);
        json(res, 500, { success: false, error: err.message || 'تعذر استخراج اللقطة' });
      }
      return;
    }

    if (reqUrl.split('?')[0] === '/api/video-info' && method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body.url || '').trim();
      if (!url) {
        json(res, 400, { success: false, error: 'الرجاء إدخال رابط الفيديو' });
        return;
      }
      const info = await fetchVideoInfo(url);
      json(res, 200, info);
      return;
    }

    if (reqUrl.split('?')[0] === '/api/channel-updates' && method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body.url || '').trim();
      if (!url) {
        json(res, 400, { success: false, error: 'رابط القناة مطلوب' });
        return;
      }
      const result = await fetchChannelUpdates(url, body.limit || 8);
      json(res, 200, {
        success: true,
        data: {
          name: result.channelName || '',
          entries: result.entries,
          checkedUrl: result.checkedUrl
        }
      });
      return;
    }

    if (reqUrl.split('?')[0] === '/api/download' && method === 'POST') {
      const body = await readJsonBody(req);
      const url = String(body.url || '').trim();
      if (!url) {
        json(res, 400, { success: false, error: 'الرجاء إدخال رابط الفيديو' });
        return;
      }
      console.log('[download] start', url, body.studioMode || body.mode || 'full', body.type || 'video-audio', body.height || 'best', body.turbo ? 'turbo' : '', body.audioEnhance ? 'enhance' : '');
      const clipType = body.clipAudioMode || body.type;
      try {
        const result = await downloadWithYtDlp({
          url,
          type: body.studioMode === 'clip'
            ? (['audio', 'video-only', 'video-audio'].includes(clipType) ? clipType : 'video-audio')
            : (body.type || 'video-audio'),
          height: body.height || 'best',
          filename: body.filename,
          mode: body.mode || body.studioMode || 'full',
          clipStart: body.clipStart,
          clipEnd: body.clipEnd,
          imageMode: body.imageMode,
          imageFormat: body.imageFormat,
          thumbnailUrl: body.thumbnailUrl,
          frameSeekTime: body.frameSeekTime,
          outputDir: body.outputDir,
          aspectRatio: body.aspectRatio,
          outputSize: body.outputSize,
          maskShape: body.maskShape,
          customWidth: body.customWidth,
          customHeight: body.customHeight,
          turbo: !!body.turbo,
          audioEnhance: !!body.audioEnhance,
          speedLimit: body.speedLimit,
          retries: body.retries,
          abr: body.abr
        });
        console.log('[download] done', result.filename);
        json(res, 200, result);
      } catch (err) {
        console.error('[download] fail', err.message);
        json(res, 500, { success: false, error: err.message || 'تعذر التحميل' });
      } finally {
        downloadSpeedOptions.turbo = false;
        downloadSpeedOptions.speedLimit = '';
        downloadSpeedOptions.retries = 0;
      }
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      json(res, 405, { success: false, error: 'Method not allowed' });
      return;
    }

    serveStatic(req, res, reqUrl);
  } catch (error) {
    console.error('[api]', reqUrl, error.message);
    json(res, 500, { success: false, error: error.message || 'خطأ غير متوقع' });
  }
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

async function startServer() {
  try {
    const { ensureYtDlp } = require('./ensure-ytdlp');
    if (!resolveYtDlpPath()) await ensureYtDlp();
  } catch (err) {
    console.warn('[yt-dlp]', err.message);
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`VM Mobile Web Server running at http://0.0.0.0:${PORT}/`);
    console.log(`yt-dlp: ${resolveYtDlpPath() || 'missing'}`);
    console.log(`ffmpeg: ${ffmpegPath && isValidBinary(ffmpegPath, 1000) ? ffmpegPath : 'missing'}`);
    console.log(`downloads: ${ensureDownloadsDir()}`);
  });
}

startServer();
