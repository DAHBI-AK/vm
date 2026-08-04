const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const ffmpegStatic = require('ffmpeg-static');
const { downloadAiDubbedVideo } = require('./ai-dub');

const APP_NAME = 'VM';
const APP_TITLE = 'VM — Downloader';
const APP_ID = 'com.vm.downloader';
const ASSETS_DIR = path.join(__dirname, '../assets');

const userDataPath = path.join(__dirname, '../data');

// Safely clean stale locks from prior runs
try {
  if (fs.existsSync(userDataPath)) {
    const lockFiles = [
      path.join(userDataPath, 'lockfile'),
      path.join(userDataPath, 'SingletonLock'),
      path.join(userDataPath, 'Local Storage', 'leveldb', 'LOCK'),
      path.join(userDataPath, 'Session Storage', 'LOCK')
    ];
    lockFiles.forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
  }
} catch {}

app.setPath('userData', userDataPath);
app.setName(APP_NAME);

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

function isValidIconFile(filePath, minSize = 1024) {
  try {
    return fs.statSync(filePath).size >= minSize;
  } catch {
    return false;
  }
}

function resolveAppIcon() {
  const iconPng = path.join(ASSETS_DIR, 'icon.png');
  const vmIconPng = path.join(ASSETS_DIR, 'vm-icon.png');
  const iconIco = path.join(ASSETS_DIR, 'icon.ico');

  if (fs.existsSync(iconPng)) {
    return iconPng;
  }
  if (fs.existsSync(vmIconPng)) {
    return vmIconPng;
  }
  if (process.platform === 'win32' && isValidIconFile(iconIco)) {
    return iconIco;
  }
  return null;
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 12 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 12 });

let mainWindow;
let uiLanguage = 'ar';
let clipboardWatchEnabled = true;
let lastClipboardRaw = '';
let dismissedClipboardUrls = new Set();
let clipboardWatchInterval = null;
let batchAutoPasteEnabled = false;
let batchAutoPasteLastRaw = '';
let batchAutoPasteInterval = null;
let ytDlpPath;
let ytDlpReady = false;
let ytDlpInitPromise = null;
let nodeRuntimeExists = null;
const infoCache = new Map();
const streamUrlCache = new Map();
const INFO_CACHE_TTL = 10 * 60 * 1000;
const STREAM_CACHE_TTL = 5 * 60 * 1000;

const MIN_YTDLP_SIZE = 1024 * 1024;

function resolveNodeRuntime() {
  const paths = [
    path.join(__dirname, '../bin/node.exe'),
    process.execPath,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe')
  ];
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p) && p.toLowerCase().endsWith('.exe')) {
        return p;
      }
    } catch {}
  }
  return null;
}

const NODE_RUNTIME = resolveNodeRuntime() || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');

const UI_STRINGS = {
  ar: {
    chooseFolder: 'اختر مجلد الحفظ',
    noFolderSelected: 'لم يتم اختيار مجلد',
    ffmpegMissing: 'ffmpeg غير متوفر. أعد تثبيت الاعتماديات',
    notifyDownloadTitle: 'اكتمل التحميل',
    notifyDownloadBody: 'تم حفظ الملف بنجاح'
  },
  en: {
    chooseFolder: 'Choose save folder',
    noFolderSelected: 'No folder selected',
    ffmpegMissing: 'ffmpeg is missing. Reinstall dependencies',
    notifyDownloadTitle: 'Download complete',
    notifyDownloadBody: 'File saved successfully'
  },
  fr: {
    chooseFolder: 'Choisir le dossier de destination',
    noFolderSelected: 'Aucun dossier sélectionné',
    ffmpegMissing: 'ffmpeg est indisponible. Réinstallez les dépendances',
    notifyDownloadTitle: 'Téléchargement terminé',
    notifyDownloadBody: 'Fichier enregistré avec succès'
  }
};

const VIDEO_HOST_PATTERNS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'tiktok.com',
  'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'soundcloud.com',
  'spotify.com', 'vimeo.com', 'dailymotion.com', 'dai.ly', 'reddit.com', 'redd.it'
];

function uiText(key) {
  return UI_STRINGS[uiLanguage]?.[key] || UI_STRINGS.ar[key] || key;
}

function ensureFfmpegReady() {
  if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
    throw new Error(uiText('ffmpegMissing'));
  }
}

const supportedPlatforms = [
  { name: 'YouTube', patterns: ['youtube.com', 'youtu.be'] },
  { name: 'Instagram', patterns: ['instagram.com', 'instagr.am'] },
  { name: 'TikTok', patterns: ['tiktok.com'] },
  { name: 'Facebook', patterns: ['facebook.com', 'fb.watch'] },
  { name: 'Twitter / X', patterns: ['twitter.com', 'x.com'] },
  { name: 'SoundCloud', patterns: ['soundcloud.com'] },
  { name: 'Pinterest', patterns: ['pinterest.com', 'pin.it'] },
  { name: 'Spotify', patterns: ['spotify.com', 'open.spotify.com'] },
  { name: 'Twitch', patterns: ['twitch.tv'] },
  { name: 'LinkedIn', patterns: ['linkedin.com'] },
  { name: 'Threads', patterns: ['threads.net'] },
  { name: 'Rumble', patterns: ['rumble.com'] },
  { name: 'VK', patterns: ['vk.com'] },
  { name: 'Telegram', patterns: ['t.me', 'telegram.org'] },
  { name: 'Bilibili', patterns: ['bilibili.com', 'b23.tv'] },
  { name: 'Vimeo', patterns: ['vimeo.com'] },
  { name: 'Dailymotion', patterns: ['dailymotion.com', 'dai.ly'] },
  { name: 'Reddit', patterns: ['reddit.com', 'redd.it'] },
];

function sendStatus(type, message) {
  mainWindow?.webContents.send('status', { type, message });
}

function isValidYtDlpBinary(filePath) {
  try {
    return fs.statSync(filePath).size >= MIN_YTDLP_SIZE;
  } catch {
    return false;
  }
}

function hasNodeRuntime() {
  if (nodeRuntimeExists === null) {
    nodeRuntimeExists = fs.existsSync(NODE_RUNTIME);
  }
  return nodeRuntimeExists;
}

function getAvailableBrowserForCookies() {
  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  // Firefox uses SQLite/NSS cookies which are unaffected by Chromium DPAPI App-Bound Encryption
  if (appData && fs.existsSync(path.join(appData, 'Mozilla', 'Firefox', 'Profiles'))) {
    return 'firefox';
  }
  if (localAppData && fs.existsSync(path.join(localAppData, 'Google', 'Chrome', 'User Data'))) {
    return 'chrome';
  }
  if (localAppData && fs.existsSync(path.join(localAppData, 'Microsoft', 'Edge', 'User Data'))) {
    return 'edge';
  }
  return null;
}

function getYtDlpBaseArgs(url = '') {
  const args = [
    '--no-update',
    '--no-warnings',
    '--no-check-certificates',
    '--geo-bypass'
  ];

  if (url && (url.includes('netflix.com') || url.includes('netflix.'))) {
    const browser = getAvailableBrowserForCookies();
    if (browser) {
      args.push('--cookies-from-browser', browser);
    }
    const cookiesTxt = path.join(process.cwd(), 'cookies.txt');
    if (fs.existsSync(cookiesTxt)) {
      args.push('--cookies', cookiesTxt);
    }
  }

  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }

  if (ffmpegStatic) {
    args.push('--ffmpeg-location', ffmpegStatic);
  }

  if (hasNodeRuntime()) {
    args.push('--js-runtimes', `node:${NODE_RUNTIME}`);
  }

  return args;
}

function getSpeedArgs(options = {}) {
  const args = [
    '--concurrent-fragments', options.turbo === false ? '4' : '5',
    '--retries', '10',
    '--fragment-retries', '10',
    '--socket-timeout', '30',
    '--no-mtime',
    '--no-write-thumbnail',
    '--no-write-info-json',
    '--no-write-comments'
  ];

  return args;
}

function getCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.time > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCacheEntry(cache, key, value, ttl) {
  cache.set(key, { value, time: Date.now(), ttl });
}

function getBestThumbnail(info) {
  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    const best = info.thumbnails[info.thumbnails.length - 1];
    if (best?.url) {
      return best.url;
    }
  }

  if (info.thumbnail) {
    if (info.thumbnail.includes('ytimg.com')) {
      return info.thumbnail
        .replace(/\/hqdefault\.jpg/, '/maxresdefault.jpg')
        .replace(/\/mqdefault\.jpg/, '/maxresdefault.jpg')
        .replace(/\/sddefault\.jpg/, '/maxresdefault.jpg');
    }
    return info.thumbnail;
  }

  return '';
}

function normalizeUrl(rawUrl) {
  let url = String(rawUrl || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (!url) {
    throw new Error('الرجاء إدخال رابط الفيديو');
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    throw new Error('الرابط غير صالح. تأكد من لصق رابط كامل للفيديو');
  }
}

function extractJsonPayload(output) {
  const text = output.trim();
  if (!text) {
    throw new Error('لم يتم استلام بيانات من yt-dlp');
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('تعذر قراءة بيانات الفيديو');
  }
}

function isVideoHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return VIDEO_HOST_PATTERNS.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
}

function extractVideoUrlFromClipboard(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }

  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const cleaned = match.replace(/[.,;!?)\]]+$/g, '');
    try {
      const parsed = new URL(cleaned);
      if (isVideoHost(parsed.hostname)) {
        return parsed.toString();
      }
    } catch {
      // try next match
    }
  }

  return null;
}

function extractAllUrlsFromClipboard(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return [];
  }

  const urls = [];
  const seen = new Set();
  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];

  for (const match of matches) {
    const cleaned = match.replace(/[.,;!?)\]]+$/g, '');
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const url = parsed.toString();
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    } catch {
      // skip invalid
    }
  }

  if (urls.length === 0) {
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        urls.push(parsed.toString());
      }
    } catch {
      // not a url
    }
  }

  return urls;
}

function startClipboardWatcher() {
  if (clipboardWatchInterval) {
    return;
  }

  clipboardWatchInterval = setInterval(() => {
    if (!clipboardWatchEnabled || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    // أثناء اللصق التلقائي للسلسلة: لا نعرض نافذة الاكتشاف الجانبية
    if (batchAutoPasteEnabled) {
      return;
    }

    let text = '';
    try {
      text = clipboard.readText();
    } catch {
      return;
    }

    if (!text || text === lastClipboardRaw) {
      return;
    }

    lastClipboardRaw = text;
    const url = extractVideoUrlFromClipboard(text);
    if (!url || dismissedClipboardUrls.has(url)) {
      return;
    }

    mainWindow.webContents.send('clipboard-url-detected', { url });
  }, 1500);
}

/** مراقبة سريعة للحافظة (كل 80ms) لإضافة الروابط المنسوخة بسرعة متتالية */
function startBatchAutoPasteWatcher() {
  if (batchAutoPasteInterval) {
    return;
  }

  batchAutoPasteInterval = setInterval(() => {
    if (!batchAutoPasteEnabled || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    let text = '';
    try {
      text = clipboard.readText();
    } catch {
      return;
    }

    if (!text || text === batchAutoPasteLastRaw) {
      return;
    }

    batchAutoPasteLastRaw = text;
    const urls = extractAllUrlsFromClipboard(text);
    if (urls.length > 0) {
      mainWindow.webContents.send('batch-auto-paste-urls', { urls });
    }
  }, 80);
}

function stopBatchAutoPasteWatcher() {
  if (batchAutoPasteInterval) {
    clearInterval(batchAutoPasteInterval);
    batchAutoPasteInterval = null;
  }
  batchAutoPasteLastRaw = '';
  batchAutoPasteEnabled = false;
}

function showDesktopNotification({ title, body }) {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: title || uiText('notifyDownloadTitle'),
    body: body || uiText('notifyDownloadBody'),
    icon: resolveAppIcon() || path.join(ASSETS_DIR, 'icon.png'),
    silent: false
  });

  notification.show();
}

function createWindow() {
  // إزالة شريط القوائم الافتراضي (File Edit View Window Help)
  Menu.setApplicationMenu(null);

  const windowIcon = resolveAppIcon();
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    show: false
  };

  if (windowIcon) {
    windowOptions.icon = windowIcon;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    startClipboardWatcher();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const tempPath = `${dest}.download`;
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
              if (!isValidYtDlpBinary(tempPath)) {
                fs.unlinkSync(tempPath);
                reject(new Error('ملف yt-dlp المحمّل غير صالح'));
                return;
              }

              if (fs.existsSync(dest)) {
                fs.unlinkSync(dest);
              }

              fs.renameSync(tempPath, dest);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
      }).on('error', reject);
    };

    request(url);
  });
}

async function ensureYtDlp() {
  ytDlpPath = path.join(__dirname, '../bin/yt-dlp.exe');
  const binDir = path.dirname(ytDlpPath);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  if (!isValidYtDlpBinary(ytDlpPath)) {
    if (fs.existsSync(ytDlpPath)) {
      fs.unlinkSync(ytDlpPath);
    }

    sendStatus('info', 'جاري تحميل yt-dlp...');
    await downloadFile(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      ytDlpPath
    );
  }
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function parseDownloadOutput(text) {
  const progressMatch = text.match(/\[download\]\s+(\d+\.?\d*)%(?:\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+(\d+:\d+))?/);
  if (progressMatch) {
    mainWindow?.webContents.send('download-progress', {
      progress: parseFloat(progressMatch[1]),
      speed: progressMatch[2] || '',
      eta: progressMatch[3] || ''
    });
  }

  const destMatch = text.match(/\[download\] Destination: (.+)/);
  if (destMatch) {
    mainWindow?.webContents.send('download-destination', { path: destMatch[1].trim() });
  }
}

function getAppHealth() {
  return {
    ready: ytDlpReady && isValidYtDlpBinary(ytDlpPath),
    ytDlp: isValidYtDlpBinary(ytDlpPath),
    ffmpeg: !!(ffmpegStatic && fs.existsSync(ffmpegStatic)),
    version: app.getVersion?.() || '1.0.0'
  };
}

function broadcastAppReady() {
  const health = getAppHealth();
  mainWindow?.webContents.send('app-ready', health);
  return health;
}

async function initYtDlp(force = false) {
  if (force) {
    ytDlpInitPromise = null;
    ytDlpReady = false;
  }

  if (ytDlpInitPromise) {
    return ytDlpInitPromise;
  }

  ytDlpInitPromise = (async () => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await ensureYtDlp();
        ytDlpReady = true;
        broadcastAppReady();
        sendStatus('success', 'التطبيق جاهز. يمكنك لصق الرابط والبحث');
        return;
      } catch (error) {
        ytDlpReady = false;
        console.error(`yt-dlp init attempt ${attempt} failed:`, error);

        if (attempt < maxAttempts) {
          sendStatus('info', `إعادة تهيئة yt-dlp... المحاولة ${attempt + 1}/${maxAttempts}`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        ytDlpInitPromise = null;
        broadcastAppReady();
        sendStatus('error', 'خطأ في تهيئة yt-dlp: ' + error.message);
        throw error;
      }
    }
  })();

  return ytDlpInitPromise;
}

async function waitForYtDlp() {
  if (ytDlpReady && isValidYtDlpBinary(ytDlpPath)) {
    return;
  }

  if (!ytDlpInitPromise) {
    await initYtDlp();
    return;
  }

  await ytDlpInitPromise;

  if (!ytDlpReady || !isValidYtDlpBinary(ytDlpPath)) {
    throw new Error('yt-dlp غير جاهز بعد. انتظر قليلاً ثم أعد المحاولة');
  }
}

function getResolutionHeight(resolution) {
  if (!resolution) return 0;
  const match = String(resolution).match(/(\d+)x(\d+)/);
  if (match) {
    return parseInt(match[2], 10) || 0;
  }

  const heightMatch = String(resolution).match(/(\d+)p/i);
  if (heightMatch) {
    return parseInt(heightMatch[1], 10) || 0;
  }

  return parseInt(resolution, 10) || 0;
}

async function getVideoInfo(url) {
  await waitForYtDlp();

  const normalizedUrl = normalizeUrl(url);
  const cached = getCacheEntry(infoCache, normalizedUrl);
  if (cached) {
    sendStatus('info', 'تم تحميل البيانات من الذاكرة المؤقتة');
    return cached;
  }

  const isNetflix = normalizedUrl.includes('netflix.com');
  const baseFlags = getYtDlpBaseArgs(normalizedUrl);
  if (!isNetflix) {
    baseFlags.push('--no-playlist');
  }

  const output = await runYtDlp([
    ...baseFlags,
    '--dump-single-json',
    '--no-warnings',
    '--no-check-certificates',
    normalizedUrl
  ]);

  const info = extractJsonPayload(output);
  const parsedFormats = parseFormats(info.formats || []);

  const result = {
    title: info.title,
    description: info.description,
    duration: info.duration,
    thumbnail: getBestThumbnail(info),
    uploader: info.uploader || info.channel,
    formats: parsedFormats,
    webpage_url: info.webpage_url || url,
    audioLanguages: parseAudioLanguages(info.formats || []),
    subtitleLanguages: parseSubtitleLanguages(info.subtitles, info.automatic_captions),
    originalLanguage: normalizeLangCode(info.language)
  };

  setCacheEntry(infoCache, normalizedUrl, result, INFO_CACHE_TTL);
  return result;
}

const LANG_LABELS = {
  ar: 'العربية',
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  hi: 'हिन्दी',
  tr: 'Türkçe'
};

function normalizeLangCode(lang) {
  if (!lang) {
    return null;
  }
  return String(lang).split('-')[0].toLowerCase();
}

function getLangLabel(code) {
  const normalized = normalizeLangCode(code);
  return LANG_LABELS[normalized] || String(code).toUpperCase();
}

function parseAudioLanguages(formats) {
  const langs = new Map();

  formats.forEach((format) => {
    if (format.acodec === 'none') {
      return;
    }

    const code = normalizeLangCode(format.language);
    if (!code) {
      return;
    }

    const existing = langs.get(code);
    const abr = format.abr || 0;
    const size = format.filesize || format.filesize_approx || 0;

    if (!existing || abr > existing.abr || size > existing.size) {
      langs.set(code, {
        code,
        name: getLangLabel(code),
        formatId: format.format_id,
        abr,
        size,
        isAudioOnly: format.vcodec === 'none'
      });
    }
  });

  return [...langs.values()].sort((a, b) => b.abr - a.abr);
}

function parseSubtitleLanguages(subtitles = {}, automaticCaptions = {}) {
  const langs = new Map();

  const addLang = (key) => {
    const code = normalizeLangCode(key);
    if (!code) {
      return;
    }
    langs.set(code, { code, name: getLangLabel(code) });
  };

  Object.keys(subtitles || {}).forEach(addLang);
  Object.keys(automaticCaptions || {}).forEach(addLang);

  return [...langs.values()];
}

function parseFormats(formats) {
  const heights = new Map();
  const audioByBitrate = new Map();

  formats.forEach((format) => {
    if (format.vcodec !== 'none') {
      const height = format.height || getResolutionHeight(format.resolution);
      if (height > 0) {
        const current = heights.get(height);
        const size = format.filesize || format.filesize_approx || 0;
        if (!current || size > (current.size || 0)) {
          heights.set(height, {
            formatId: String(height),
            quality: `${height}p`,
            resolution: format.resolution,
            height,
            ext: format.ext,
            size,
            hasAudio: format.acodec !== 'none'
          });
        }
      }
    } else if (format.vcodec === 'none' && format.acodec !== 'none') {
      const abr = Math.round(format.abr || 0);
      const key = abr > 0 ? String(abr) : format.format_id;
      const current = audioByBitrate.get(key);
      const size = format.filesize || format.filesize_approx || 0;

      if (!current || size > (current.size || 0)) {
        audioByBitrate.set(key, {
          formatId: format.format_id,
          quality: abr > 0 ? `${abr}kbps` : (format.format_note || 'صوت'),
          ext: format.ext,
          size,
          abr: abr > 0 ? abr : 0
        });
      }
    }
  });

  const audioFormats = [...audioByBitrate.values()];

  const videoHeights = [...heights.values()].sort((a, b) => (a.height || 0) - (b.height || 0));
  audioFormats.sort((a, b) => (a.abr || 0) - (b.abr || 0));

  return {
    videoWithAudio: videoHeights,
    videoOnly: videoHeights,
    audio: audioFormats
  };
}

function getVideoWithAudioSelector(options) {
  if (options.height === 'best' || !options.height) {
    return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
  }

  const height = Number(options.height);
  if (Number.isFinite(height) && height > 0) {
    return `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best`;
  }

  return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
}

function formatSectionTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function applyClipSection(args, options) {
  if (options.mode !== 'clip') {
    return;
  }

  const clipStart = Number(options.clipStart);
  const clipEnd = Number(options.clipEnd);

  if (!Number.isFinite(clipStart) || !Number.isFinite(clipEnd) || clipEnd <= clipStart) {
    throw new Error('نطاق القص غير صالح. تأكد أن وقت النهاية أكبر من البداية');
  }

  args.push(
    '--download-sections',
    `*${formatSectionTime(clipStart)}-${formatSectionTime(clipEnd)}`,
    '--force-keyframes-at-cuts'
  );
}

function getVideoOnlySelector(options) {
  if (options.height === 'best' || !options.height) {
    return 'bestvideo[ext=mp4]/bestvideo/best';
  }

  const height = Number(options.height);
  if (Number.isFinite(height) && height > 0) {
    return `bestvideo[height<=${height}][ext=mp4]/bestvideo[height<=${height}]/best`;
  }

  return 'bestvideo[ext=mp4]/bestvideo/best';
}

function buildDownloadArgs(url, options, outputPath) {
  const output = path.join(outputPath, options.filename);
  const normalizedUrl = normalizeUrl(url);
  const isNetflix = normalizedUrl.includes('netflix.com');
  const baseArgs = getYtDlpBaseArgs(normalizedUrl);
  if (!isNetflix) {
    baseArgs.push('--no-playlist');
  }

  const args = [
    ...baseArgs,
    ...getSpeedArgs({ turbo: options.turbo !== false }),
    '--newline',
    '--progress'
  ];

  if (options.type === 'audio') {
    args.push(
      '-f', 'bestaudio/best',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0'
    );
  } else if (options.type === 'video-only') {
    args.push(
      '-f', getVideoOnlySelector(options),
      '--remux-video', 'mp4'
    );
  } else if (options.mode === 'clip') {
    const clipType = options.type === 'video-only' ? 'video-only' : 'video-audio';
    if (clipType === 'video-only') {
      args.push('-f', getVideoOnlySelector(options), '--remux-video', 'mp4');
    } else {
      args.push(
        '-f', getVideoWithAudioSelector(options),
        '--merge-output-format', 'mp4'
      );
    }
    applyClipSection(args, options);
  } else {
    args.push(
      '-f', getVideoWithAudioSelector(options),
      '--merge-output-format', 'mp4'
    );

    if (options.mode !== 'clip') {
      args.push('--embed-metadata');
    }
  }

  args.push('-o', output, normalizedUrl);

  return { args, output };
}

function downloadRemoteFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const request = (targetUrl) => {
      const isHttps = targetUrl.startsWith('https');
      const client = isHttps ? https : http;
      client.get(targetUrl, { agent: isHttps ? httpsAgent : httpAgent }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`فشل تحميل الصورة (HTTP ${response.statusCode})`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve({ success: true, path: outputPath }));
        });
      }).on('error', reject);
    };

    request(url);
  });
}

function getFormatSelectorForPreview(options = {}) {
  const type = options.type || 'video-audio';
  if (type === 'audio' || options.mode === 'audio') {
    return 'bestaudio[ext=m4a]/bestaudio/best';
  }

  const height = Number(options.height);
  if (Number.isFinite(height) && height > 0) {
    return `best[height<=${height}][ext=mp4]/22/18/bestvideo[height<=${height}]+bestaudio/best`;
  }

  return '22/18/best[ext=mp4]/bestvideo+bestaudio/best';
}

async function getStreamUrl(url, options = {}) {
  const normalizedUrl = normalizeUrl(url);
  const formatSelector = typeof options === 'boolean'
    ? (options ? 'bestvideo/best' : 'best[ext=mp4]/bestvideo+bestaudio/best')
    : getFormatSelectorForPreview(options);

  const cacheKey = `${normalizedUrl}:${formatSelector}`;
  const cached = getCacheEntry(streamUrlCache, cacheKey);
  if (cached) {
    return cached;
  }

  const output = await runYtDlp([
    ...getYtDlpBaseArgs(normalizedUrl),
    '-f', formatSelector,
    '--print', 'url',
    '--no-playlist',
    normalizedUrl
  ]);

  const lines = output.trim().split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error('تعذر الحصول على رابط البث للفيديو');
  }

  setCacheEntry(streamUrlCache, cacheKey, lines[0], STREAM_CACHE_TTL);
  return lines[0];
}

function extractFrameAtTime(streamUrl, timeSec, outputPath, imageFormat) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', String(Math.max(0, timeSec)),
      '-i', streamUrl,
      '-an',
      '-frames:v', '1',
      '-threads', '0',
      '-y'
    ];

    if (imageFormat === 'png') {
      args.push('-vcodec', 'png');
    } else if (imageFormat === 'webp') {
      args.push('-vcodec', 'libwebp', '-quality', '92');
    } else {
      args.push('-q:v', '2');
    }

    args.push(outputPath);

    const child = spawn(ffmpegStatic, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, path: outputPath });
        return;
      }
      reject(new Error(stderr.trim() || 'فشل استخراج اللقطة من الفيديو'));
    });
  });
}

async function downloadThumbnailImage(thumbnailUrl, outputPath) {
  if (!thumbnailUrl) {
    throw new Error('لا توجد صورة مصغرة لهذا الفيديو');
  }
  return downloadRemoteFile(thumbnailUrl, outputPath);
}

async function downloadFrameImage(url, frameTime, outputPath, imageFormat) {
  await waitForYtDlp();
  const streamUrl = await getStreamUrl(url, true);
  return extractFrameAtTime(streamUrl, frameTime, outputPath, imageFormat);
}

function convertImageFormatWithFFmpeg(inputPath, outputPath, targetFormat) {
  return new Promise((resolve) => {
    if (!fs.existsSync(inputPath)) {
      resolve({ success: false });
      return;
    }

    const ext = path.extname(outputPath);
    const tempOutput = path.join(path.dirname(outputPath), `_fmt_${Date.now()}${ext}`);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-y', tempOutput];

    if (targetFormat === 'png') {
      args.splice(5, 0, '-vcodec', 'png');
    } else if (targetFormat === 'webp') {
      args.splice(5, 0, '-vcodec', 'libwebp', '-quality', '92');
    } else if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
      args.splice(5, 0, '-q:v', '2');
    }

    const child = spawn(ffmpegStatic, args, { windowsHide: true });
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(inputPath); } catch {}
        try {
          fs.renameSync(tempOutput, outputPath);
        } catch {
          fs.copyFileSync(tempOutput, outputPath);
          try { fs.unlinkSync(tempOutput); } catch {}
        }
        resolve({ success: true, path: outputPath });
      } else {
        resolve({ success: true, path: inputPath });
      }
    });
    child.on('error', () => resolve({ success: true, path: inputPath }));
  });
}

function cropImageWithFFmpeg(inputPath, outputPath, cropOption, customWidth, customHeight, maskShape = 'rect', cropPos = { x: 50, y: 50 }) {
  return new Promise((resolve) => {
    let filter = '';
    const normX = Math.max(0, Math.min(100, Number(cropPos.x) || 0)) / 100;
    const normY = Math.max(0, Math.min(100, Number(cropPos.y) || 0)) / 100;

    if (cropOption === '1:1') {
      filter = `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))*${normX}:(ih-min(iw\\,ih))*${normY}`;
    } else if (cropOption === '9:16') {
      filter = `crop=ih*9/16:ih:(iw-ih*9/16)*${normX}:0`;
    } else if (cropOption === '4:5') {
      filter = `crop=ih*4/5:ih:(iw-ih*4/5)*${normX}:0`;
    } else if (cropOption === '21:9') {
      filter = `crop=iw:iw*9/21:0:(ih-iw*9/21)*${normY}`;
    } else if (cropOption === 'custom' && customWidth > 0 && customHeight > 0) {
      filter = `scale=${customWidth}:${customHeight}:force_original_aspect_ratio=decrease,pad=${customWidth}:${customHeight}:(ow-iw)/2:(oh-ih)/2`;
    }

    if (maskShape === 'circle') {
      const baseFilter = filter ? filter + ',' : '';
      filter = baseFilter + "format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(abs(W/2-X)^2+abs(H/2-Y)^2\\,(W/2)^2)\\,0\\,255)'";
    }

    if (!filter) {
      resolve({ success: true, path: inputPath });
      return;
    }

    const ext = path.extname(outputPath);
    const tempOutput = path.join(path.dirname(outputPath), `_cropped_${Date.now()}${ext}`);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vf', filter, '-y', tempOutput];
    const child = spawn(ffmpegStatic, args, { windowsHide: true });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutput)) {
        try {
          fs.unlinkSync(outputPath);
        } catch {}
        try {
          fs.renameSync(tempOutput, outputPath);
        } catch {
          fs.copyFileSync(tempOutput, outputPath);
          try { fs.unlinkSync(tempOutput); } catch {}
        }
        resolve({ success: true, path: outputPath });
      } else {
        resolve({ success: true, path: inputPath });
      }
    });
    child.on('error', () => resolve({ success: true, path: inputPath }));
  });
}

function sendDownloadProgress(progress, extra = {}) {
  mainWindow?.webContents.send('download-progress', {
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    speed: extra.speed || '',
    eta: extra.eta || '',
    message: extra.message || ''
  });
}

function spawnYtDlpDownload(args, { progressStart = 0, progressEnd = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });

    let stderr = '';
    const span = Math.max(1, progressEnd - progressStart);

    const handleOutput = (text) => {
      const progressMatch = text.match(/\[download\]\s+(\d+\.?\d*)%(?:\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+(\d+:\d+))?/);
      if (progressMatch) {
        const raw = parseFloat(progressMatch[1]);
        sendDownloadProgress(progressStart + (raw / 100) * span, {
          speed: progressMatch[2] || '',
          eta: progressMatch[3] || ''
        });
      }

      const destMatch = text.match(/\[download\] Destination: (.+)/);
      if (destMatch) {
        mainWindow?.webContents.send('download-destination', { path: destMatch[1].trim() });
      }
    };

    child.stdout.on('data', (data) => handleOutput(data.toString()));
    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      handleOutput(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        sendDownloadProgress(progressEnd);
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function mergeVideoWithDubAudio(videoPath, audioPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const mixWithBackground = options.preserveBackground === true;
    const burnSubtitleFile = options.burnSubtitleFile || null;

    let filterStr = mixWithBackground
      ? '[0:a]volume=0.2,highpass=f=80,lowpass=f=12000[bg];[1:a]volume=1.3[fg];[bg][fg]amix=inputs=2:duration=first:dropout_transition=2[a]'
      : '';

    let videoFilterStr = '';
    if (burnSubtitleFile && fs.existsSync(burnSubtitleFile)) {
      const escapedPath = burnSubtitleFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      videoFilterStr = `subtitles='${escapedPath}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,SecondaryColour=&H00000000,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=20,MarginL=30,MarginR=30'`;
    }

    const args = ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-i', audioPath];

    if (mixWithBackground && videoFilterStr) {
      args.push('-filter_complex', `${filterStr};[0:v]${videoFilterStr}[v]`, '-map', '[v]', '-map', '[a]');
    } else if (mixWithBackground) {
      args.push('-filter_complex', filterStr, '-map', '0:v:0', '-map', '[a]', '-sn');
    } else if (videoFilterStr) {
      args.push('-vf', videoFilterStr, '-map', '0:v:0', '-map', '1:a:0');
    } else {
      args.push('-map', '0:v:0', '-map', '1:a:0', '-sn');
    }

    args.push('-c:v', videoFilterStr ? 'libx264' : 'copy', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '192k', '-y', outputPath);

    const child = spawn(ffmpegStatic, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ success: true, path: outputPath });
        return;
      }
      if (mixWithBackground || videoFilterStr) {
        mergeVideoWithDubAudio(videoPath, audioPath, outputPath, { preserveBackground: false }).then(resolve).catch(reject);
        return;
      }
      reject(new Error(stderr.trim() || 'فشل دمج الفيديو مع الصوت المدبلج والترجمة'));
    });
  });
}

function cleanupTempFiles(paths) {
  paths.forEach((filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return;
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore cleanup errors
    }
  });
}

function getDubbedAudioSelector(lang) {
  const code = normalizeLangCode(lang);
  if (!code) {
    return 'bestaudio/best';
  }
  return `bestaudio[language=${code}]/bestaudio[language^=${code}]/bestaudio`;
}

async function downloadDubbedVideo(url, options, outputDir) {
  ensureFfmpegReady();
  const normalizedUrl = normalizeUrl(url);
  const output = path.join(outputDir, options.filename);
  const tempId = Date.now();
  const tempVideo = path.join(outputDir, `._v1_temp_vid_${tempId}.mp4`);
  const tempAudio = path.join(outputDir, `._v1_temp_aud_${tempId}`);

  const baseArgs = [
    ...getYtDlpBaseArgs(normalizedUrl),
    ...getSpeedArgs({ turbo: options.turbo !== false }),
    '--no-playlist',
    '--newline',
    '--progress'
  ];

  try {
    sendDownloadProgress(0, { message: 'تحميل الفيديو بدون الصوت الأصلي...' });
    await spawnYtDlpDownload([
      ...baseArgs,
      '-f', getVideoOnlySelector(options),
      '--remux-video', 'mp4',
      '-o', tempVideo,
      normalizedUrl
    ], { progressStart: 0, progressEnd: 55 });

    sendDownloadProgress(55, { message: `تحميل الصوت المدبلج (${getLangLabel(options.dubLanguage)})...` });
    await spawnYtDlpDownload([
      ...baseArgs,
      '-f', getDubbedAudioSelector(options.dubLanguage),
      '--no-video',
      '-o', tempAudio,
      normalizedUrl
    ], { progressStart: 55, progressEnd: 88 });

    const audioFile = [tempAudio, `${tempAudio}.m4a`, `${tempAudio}.webm`, `${tempAudio}.opus`]
      .find((candidate) => candidate && fs.existsSync(candidate));

    if (!audioFile) {
      throw new Error(`لا يتوفر صوت مدبلج بلغة ${getLangLabel(options.dubLanguage)} لهذا الفيديو`);
    }

    sendDownloadProgress(90, { message: 'دمج الفيديو مع الصوت المدبلج (بدون الصوت الأصلي)...' });
    await mergeVideoWithDubAudio(tempVideo, audioFile, output);
    sendDownloadProgress(100, { message: 'اكتمل التحميل' });

    return { success: true, path: output };
  } finally {
    cleanupTempFiles([tempVideo, tempAudio, `${tempAudio}.m4a`, `${tempAudio}.webm`, `${tempAudio}.opus`]);
  }
}

async function downloadWithSubtitles(url, options, outputDir) {
  ensureFfmpegReady();
  const normalizedUrl = normalizeUrl(url);
  const output = path.join(outputDir, options.filename);
  const tempId = Date.now();
  const tempVideo = path.join(outputDir, `._v_sub_temp_${tempId}.mp4`);
  const subBase = path.join(outputDir, `._v_sub_file_${tempId}`);
  const targetLang = normalizeLangCode(options.dubLanguage) || 'ar';

  try {
    sendDownloadProgress(0, { message: 'تحميل الفيديو مع الصوت الأصلي...' });
    await spawnYtDlpDownload([
      ...getYtDlpBaseArgs(normalizedUrl),
      ...getSpeedArgs({ turbo: options.turbo !== false }),
      '-f', getVideoWithAudioSelector(options),
      '--merge-output-format', 'mp4',
      '-o', tempVideo,
      normalizedUrl
    ], { progressStart: 0, progressEnd: 45 });

    sendDownloadProgress(48, { message: `جلب ملف الترجمة والنصوص (${getLangLabel(options.dubLanguage)})...` });
    try {
      await runYtDlp([
        ...getYtDlpBaseArgs(normalizedUrl),
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs', 'all,-live_chat',
        '--sub-format', 'vtt/srt/best',
        '--skip-download',
        '--ignore-errors',
        '--no-warnings',
        '--no-update',
        '-o', subBase,
        normalizedUrl
      ]);
    } catch {
      // non-critical
    }

    const files = fs.readdirSync(outputDir).filter((f) => f.startsWith(`._v_sub_file_${tempId}`) && (f.endsWith('.vtt') || f.endsWith('.srt')));
    let subFilePath = null;

    if (files.length > 0) {
      const match = files.find((f) => f.includes(`.${targetLang}.`) || f.includes('.ar.') || f.includes('.en.') || f.includes('.fr.')) || files[0];
      subFilePath = path.join(outputDir, match);
    }

    if (!subFilePath) {
      sendDownloadProgress(55, { message: `توليد ترجمة مدمجة متزامنة باللغة ${getLangLabel(options.dubLanguage)}...` });
      try {
        const { generateSyntheticCues, buildSrtContent } = require('./ai-dub');
        const getMediaDuration = (ffmpeg, file) => new Promise((resolve) => {
          const child = spawn(ffmpeg, ['-hide_banner', '-i', file], { windowsHide: true });
          let stderr = '';
          child.stderr.on('data', (d) => stderr += d.toString());
          child.on('close', () => {
            const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
            if (match) {
              resolve((parseInt(match[1], 10) * 3600) + (parseInt(match[2], 10) * 60) + parseFloat(match[3]));
            } else {
              resolve(30);
            }
          });
        });
        const videoDuration = await getMediaDuration(ffmpegStatic, tempVideo);
        const synthCues = await generateSyntheticCues(ffmpegStatic, tempVideo, videoDuration, targetLang);
        const synthSrtPath = path.join(outputDir, `._v_sub_synth_${tempId}.srt`);
        fs.writeFileSync(synthSrtPath, buildSrtContent(synthCues), 'utf-8');
        subFilePath = synthSrtPath;
      } catch (synthErr) {
        console.warn('Notice generating synthetic subs for downloadWithSubtitles:', synthErr.message);
      }
    }

    if (!subFilePath) {
      sendDownloadProgress(95, { message: 'تجهيز الفيديو بالصوت الأصلي...' });
      if (fs.existsSync(output)) {
        try { fs.unlinkSync(output); } catch {}
      }
      fs.renameSync(tempVideo, output);
      return { success: true, path: output };
    }

    let finalSubPath = subFilePath;
    const baseLang = targetLang.split('-')[0];
    if (!subFilePath.toLowerCase().includes(`.${baseLang}.`)) {
      sendDownloadProgress(68, { message: `ترجمة التسميات التوضيحية تلقائياً إلى (${getLangLabel(targetLang)})...` });
      try {
        const { parseSubtitleFile, translateTextBatch, buildSrtContent } = require('./ai-dub');
        const cues = parseSubtitleFile(subFilePath);
        if (cues && cues.length > 0) {
          const translatedTexts = await translateTextBatch(cues, targetLang);
          const translatedCues = cues.map((c, idx) => ({ ...c, text: translatedTexts[idx] || c.text }));
          const srtContent = buildSrtContent(translatedCues);
          const translatedSrtPath = path.join(outputDir, `._v_sub_trans_${tempId}.srt`);
          fs.writeFileSync(translatedSrtPath, srtContent, 'utf-8');
          finalSubPath = translatedSrtPath;
        }
      } catch (err) {
        console.warn('Auto translation notice:', err.message);
      }
    }

    sendDownloadProgress(80, { message: `دمج وطباعة الترجمة النصية (${getLangLabel(options.dubLanguage)}) على الفيديو والصوت الأصلي...` });
    
    let srtSubPath = finalSubPath;
    if (!finalSubPath.toLowerCase().endsWith('.srt')) {
      try {
        const { parseSubtitleFile, buildSrtContent } = require('./ai-dub');
        const cues = parseSubtitleFile(finalSubPath);
        if (cues && cues.length > 0) {
          const convertedSrtPath = path.join(outputDir, `._v_sub_converted_${tempId}.srt`);
          fs.writeFileSync(convertedSrtPath, buildSrtContent(cues), 'utf-8');
          srtSubPath = convertedSrtPath;
        }
      } catch (e) {
        console.warn('SRT conversion notice:', e.message);
      }
    }

    const escapedSubPath = srtSubPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    
    const ffmpegBurnArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', tempVideo,
      '-vf', `subtitles='${escapedSubPath}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=25'`,
      '-c:a', 'copy',
      '-y',
      output
    ];

    let burnSuccess = false;
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(ffmpegStatic, ffmpegBurnArgs, { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (d) => stderr += d.toString());
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 1000) {
            burnSuccess = true;
            resolve();
          } else {
            reject(new Error(stderr.trim() || 'Burn-in subtitle failed'));
          }
        });
      });
    } catch {
      const ffmpegSoftArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', tempVideo,
        '-i', srtSubPath,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-c:s', 'mov_text',
        '-metadata:s:s:0', `language=${targetLang}`,
        '-y',
        output
      ];
      await new Promise((resolve, reject) => {
        const child = spawn(ffmpegStatic, ffmpegSoftArgs, { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (d) => stderr += d.toString());
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0 && fs.existsSync(output)) {
            resolve();
          } else {
            try {
              if (fs.existsSync(output)) fs.unlinkSync(output);
              fs.copyFileSync(tempVideo, output);
              resolve();
            } catch (e) {
              reject(new Error(stderr.trim() || 'فشل دمج الترجمة النصية'));
            }
          }
        });
      });
    }

    sendDownloadProgress(100, { message: 'اكتمل تحميل وطباعة الفيديو مع الترجمة النصية والصوت الأصلي بنجاح' });
    return { success: true, path: output };
  } finally {
    const allTemp = fs.readdirSync(outputDir).filter((f) => f.startsWith(`._v_sub_file_${tempId}`) || f.startsWith(`._v_sub_temp_${tempId}`) || f.startsWith(`._v_sub_ar_${tempId}`) || f.startsWith(`._v_sub_converted_${tempId}`));
    allTemp.forEach((f) => {
      try { fs.unlinkSync(path.join(outputDir, f)); } catch {}
    });
  }
}

ipcMain.handle('clear-cache', () => {
  infoCache.clear();
  streamUrlCache.clear();
  return { success: true };
});

ipcMain.handle('get-stream-url', async (event, data) => {
  try {
    await waitForYtDlp();
    const url = typeof data === 'string' ? data : data?.url;
    const options = typeof data === 'object' ? data?.options : {};
    const streamUrl = await getStreamUrl(url, options);
    return { success: true, url: streamUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-preview-subtitles', async (event, data) => {
  try {
    await waitForYtDlp();
    const url = typeof data === 'string' ? data : data?.url;
    const rawLang = data?.language || 'ar';
    const baseLang = rawLang.split('-')[0];
    const normalizedUrl = normalizeUrl(url);
    const subBase = path.join(app.getPath('temp'), `preview_sub_${Date.now()}`);
    await runYtDlp([
      ...getYtDlpBaseArgs(normalizedUrl),
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', `${baseLang},${rawLang},ar,en,fr,es,de,all,-live_chat`,
      '--sub-format', 'vtt',
      '--skip-download',
      '--ignore-errors',
      '--no-warnings',
      '--no-update',
      '-o', subBase,
      normalizedUrl
    ]);

    const tempDir = app.getPath('temp');
    const baseName = path.basename(subBase);
    const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(baseName) && f.endsWith('.vtt'));
    if (files.length > 0) {
      const filePath = path.join(tempDir, files[0]);
      const vttContent = fs.readFileSync(filePath, 'utf-8');
      try { fs.unlinkSync(filePath); } catch {}
      return { success: true, vttContent, language: rawLang };
    }
    return { success: false, error: 'لا تتوفر ترجمة تلقائية لهذ الفيديو' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

async function downloadVideo(url, options, outputPath) {
  if (!ytDlpPath || !isValidYtDlpBinary(ytDlpPath)) {
    throw new Error('yt-dlp غير جاهز بعد');
  }

  const { args, output } = buildDownloadArgs(url, options, outputPath);

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    });

    let stderr = '';

    child.stdout.on('data', (data) => {
      parseDownloadOutput(data.toString());
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      parseDownloadOutput(text);

      if (!text.includes('WARNING')) {
        console.error('Download stderr:', text);
      }
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, path: output });
        return;
      }

      if (/ffmpeg|merger|Merging/i.test(stderr)) {
        reject(new Error('فشل دمج الصوت مع الفيديو. تأكد من اكتمال التحميل ثم أعد المحاولة'));
        return;
      }

      reject(new Error(stderr.trim() || `فشل التحميل (رمز الخطأ: ${code})`));
    });
  });
}

ipcMain.handle('get-app-status', () => getAppHealth());

ipcMain.handle('repair-app', async () => {
  try {
    infoCache.clear();
    streamUrlCache.clear();
    sendStatus('info', 'جاري تحديث yt-dlp وإعادة تهيئة المحرك تلقائياً...');
    if (ytDlpPath && fs.existsSync(ytDlpPath)) {
      try {
        fs.unlinkSync(ytDlpPath);
      } catch {
        // ignore
      }
    }
    await initYtDlp(true);
    return { success: true, ...getAppHealth() };
  } catch (error) {
    return { success: false, error: error.message, ...getAppHealth() };
  }
});

ipcMain.handle('get-video-info', async (event, url) => {
  try {
    const info = await getVideoInfo(url);
    return { success: true, data: info };
  } catch (error) {
    const message = error.message || 'فشل في جلب معلومات الفيديو';
    return { success: false, error: message };
  }
});

async function resolveOutputDirectory(preferredPath) {
  if (preferredPath && fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: uiText('chooseFolder'),
    defaultPath: preferredPath || app.getPath('downloads')
  });

  if (!filePaths || filePaths.length === 0) {
    throw new Error(uiText('noFolderSelected'));
  }

  return filePaths[0];
}

ipcMain.handle('set-language', (event, lang) => {
  if (UI_STRINGS[lang]) {
    uiLanguage = lang;
  }
  return { success: true, language: uiLanguage };
});

ipcMain.handle('set-clipboard-watch', (event, enabled) => {
  clipboardWatchEnabled = !!enabled;
  return { success: true, enabled: clipboardWatchEnabled };
});

ipcMain.handle('set-batch-auto-paste', (event, enabled) => {
  batchAutoPasteEnabled = !!enabled;
  if (batchAutoPasteEnabled) {
    // تجاهل محتوى الحافظة الحالي — فقط ما يُنسخ بعد التفعيل
    try {
      batchAutoPasteLastRaw = clipboard.readText();
    } catch {
      batchAutoPasteLastRaw = '';
    }
    startBatchAutoPasteWatcher();
  } else {
    stopBatchAutoPasteWatcher();
  }
  return { success: true, enabled: batchAutoPasteEnabled };
});

ipcMain.handle('dismiss-clipboard-url', (event, url) => {
  if (url) {
    dismissedClipboardUrls.add(String(url));
  }
  return { success: true };
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  showDesktopNotification({ title, body });
  return { success: true };
});

ipcMain.handle('select-download-folder', async (event, currentPath) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: uiText('chooseFolder'),
    defaultPath: currentPath || app.getPath('downloads')
  });

  if (canceled || !filePaths?.length) {
    return { success: false, canceled: true };
  }

  return { success: true, path: filePaths[0] };
});

ipcMain.handle('get-downloads-path', () => app.getPath('downloads'));

ipcMain.handle('download', async (event, { url, options }) => {
  try {
    ensureFfmpegReady();
    const outputDir = await resolveOutputDirectory(options?.downloadDir);

    if (options.mode === 'image') {
      const imageFormat = options.imageFormat || 'png';
      const outputPath = path.join(outputDir, `${options.filename}.${imageFormat}`);

      let res;
      if (options.imageMode === 'thumbnail') {
        res = await downloadThumbnailImage(options.thumbnailUrl, outputPath);
        await convertImageFormatWithFFmpeg(outputPath, outputPath, imageFormat);
      } else {
        res = await downloadFrameImage(url, Number(options.frameTime) || 0, outputPath, imageFormat);
      }

      if (options.aspectRatio && options.aspectRatio !== 'default') {
        await cropImageWithFFmpeg(
          outputPath,
          outputPath,
          options.aspectRatio,
          options.customWidth,
          options.customHeight,
          options.maskShape || 'rect',
          options.cropPos || { x: 50, y: 50 }
        );
      }

      return res;
    }

    if (options.mode === 'dub') {
      if (options.dubMode === 'ai' || options.dubMode === 'dub_and_sub') {
        options.mode = options.dubMode;
        return await downloadAiDubbedVideo({
          url,
          options,
          outputDir,
          helpers: {
            normalizeUrl,
            getYtDlpBaseArgs,
            getSpeedArgs,
            getVideoOnlySelector,
            getVideoWithAudioSelector,
            spawnYtDlpDownload,
            runYtDlp,
            mergeVideoWithDubAudio,
            cleanupTempFiles,
            sendDownloadProgress,
            ffmpegPath: ffmpegStatic
          }
        });
      }
      if (options.dubMode === 'subtitles') {
        return await downloadWithSubtitles(url, options, outputDir);
      }
      return await downloadDubbedVideo(url, options, outputDir);
    }

    const result = await downloadVideo(url, options, outputDir);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-supported-platforms', () => supportedPlatforms);

ipcMain.handle('open-downloads', async (event, customPath) => {
  const targetFolder = (customPath && fs.existsSync(customPath))
    ? customPath
    : app.getPath('downloads');
  shell.openPath(targetFolder);
});

ipcMain.handle('open-path', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return { success: false, error: 'الملف غير موجود' };
  }
  return shell.openPath(path.normalize(filePath));
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return { success: false, error: 'الملف غير موجود' };
  }
  shell.showItemInFolder(path.normalize(filePath));
  return { success: true };
});

ipcMain.handle('translate-video-or-text', async (event, { input, targetLang }) => {
  try {
    return await translateVideoOrText({ input, targetLang });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function sendTranslateProgress(percent, status) {
  mainWindow?.webContents.send('translate-progress', {
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    status: status || ''
  });
}

async function translateVideoOrText({ input, targetLang = 'ar' }) {
  const text = String(input || '').trim();
  if (!text) {
    throw new Error('الرجاء إدخال نص أو رابط فيديو للترجمة');
  }

  const isUrl = /^https?:\/\//i.test(text);

  if (!isUrl) {
    sendTranslateProgress(20, 'جاري ترجمة النص عبر Google Translate...');
    const { translateText } = require('./ai-dub');
    const translated = await translateText(text, targetLang);
    sendTranslateProgress(100, 'اكتملت الترجمة النصية!');
    return { success: true, text: translated, type: 'text' };
  }

  sendTranslateProgress(15, 'جاري فحص رابط الفيديو واستخراج شريط الحديث...');
  await waitForYtDlp();
  const normalizedUrl = normalizeUrl(text);
  const tempDir = app.getPath('temp');
  const tempId = Date.now();
  const subBase = path.join(tempDir, `._trans_sub_${tempId}`);

  sendTranslateProgress(35, 'جلب واستخراج الكلمات المنطوقة من الفيديو...');
  try {
    await runYtDlp([
      ...getYtDlpBaseArgs(normalizedUrl),
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'all,-live_chat',
      '--sub-format', 'vtt/srt/best',
      '--skip-download',
      '--ignore-errors',
      '--no-warnings',
      '-o', subBase,
      normalizedUrl
    ]);
  } catch (err) {
    console.warn('Subtitle download notice:', err.message);
  }

  sendTranslateProgress(60, 'معالجة وتدقيق الكلمات المنطوقة الاستخراجية...');
  const files = fs.readdirSync(tempDir).filter((f) => f.startsWith(`._trans_sub_${tempId}`) && (f.endsWith('.vtt') || f.endsWith('.srt')));

  const { parseSubtitleFile, translateTextBatch } = require('./ai-dub');
  let cues = [];

  if (files.length > 0) {
    const preferredFile = files.find(f => f.includes('.ar.') || f.includes('.en.') || f.includes('.fr.')) || files[0];
    const subFilePath = path.join(tempDir, preferredFile);
    cues = parseSubtitleFile(subFilePath);
    cleanupTempFiles(files.map(f => path.join(tempDir, f)));
  }

  if (!cues || cues.length === 0) {
    sendTranslateProgress(65, 'جاري تحليل وترجمة نصوص وكابشن الفيديو عبر Google Translate...');
    const { generateSyntheticCues } = require('./ai-dub');
    cues = await generateSyntheticCues(ffmpegStatic, normalizedUrl, 60, targetLang);
  }

  // Deduplicate and clean spoken cues
  const cleanCues = [];
  let lastText = '';
  cues.forEach((cue) => {
    const t = String(cue.text || '').trim();
    if (t && t !== lastText) {
      cleanCues.push(cue);
      lastText = t;
    }
  });

  sendTranslateProgress(75, `ترجمة ${cleanCues.length} جملة منطوقة عبر Google Translate...`);
  const translatedTexts = await translateTextBatch(cleanCues, targetLang);
  
  sendTranslateProgress(95, 'تنسيق وترتيب شريط الترجمة المباشر...');
  const formattedLines = cleanCues.map((c, idx) => {
    const timeStr = c.start ? `[${c.start}] ` : '';
    const transStr = translatedTexts[idx] || c.text;
    return `${timeStr}${transStr}`;
  });

  sendTranslateProgress(100, 'اكتملت الترجمة بنجاح!');
  return {
    success: true,
    type: 'speech_subtitles',
    text: `🎙️ كلمات الفيديو المنطوقة المترجمة فورياً (عبر Google Translate):\n\n` + formattedLines.slice(0, 200).join('\n')
  };
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createWindow();
    initYtDlp().catch((error) => {
      console.error('Startup init failed:', error);
    });
  });

  app.on('window-all-closed', () => {
    if (clipboardWatchInterval) {
      clearInterval(clipboardWatchInterval);
      clipboardWatchInterval = null;
    }
    stopBatchAutoPasteWatcher();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      initYtDlp().catch((error) => {
        console.error('Re-activation init failed:', error);
      });
    }
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
