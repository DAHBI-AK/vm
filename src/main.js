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
const MAX_CACHE_ENTRIES = 300;
let activeDownloadChild = null;

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
    notifyDownloadBody: 'تم حفظ الملف بنجاح',
    netflixDrmBlocked: 'Netflix محمي بـ DRM: لا يمكن تحميل الفيلم أو المسلسل عبر VM. الاشتراك لا يتخطى الحماية — استخدم التحميل الرسمي داخل تطبيق Netflix فقط. ما يظهر أحياناً هو تريلر ترويجي وليس الفيلم.'
  },
  en: {
    chooseFolder: 'Choose save folder',
    noFolderSelected: 'No folder selected',
    ffmpegMissing: 'ffmpeg is missing. Reinstall dependencies',
    notifyDownloadTitle: 'Download complete',
    notifyDownloadBody: 'File saved successfully',
    netflixDrmBlocked: 'Netflix is DRM-protected: VM cannot download full movies/series. A subscription does not bypass DRM — use official offline download in the Netflix app. Trailers may appear, but they are not the full title.'
  },
  fr: {
    chooseFolder: 'Choisir le dossier de destination',
    noFolderSelected: 'Aucun dossier sélectionné',
    ffmpegMissing: 'ffmpeg est indisponible. Réinstallez les dépendances',
    notifyDownloadTitle: 'Téléchargement terminé',
    notifyDownloadBody: 'Fichier enregistré avec succès',
    netflixDrmBlocked: 'Netflix est protégé par DRM : VM ne peut pas télécharger films/séries complets. L\'abonnement ne contourne pas la protection — utilisez le téléchargement officiel dans l\'app Netflix. Les bandes-annonces ne sont pas le contenu complet.'
  }
};

const VIDEO_HOST_PATTERNS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'tiktok.com',
  'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'soundcloud.com',
  'spotify.com', 'vimeo.com', 'dailymotion.com', 'dai.ly', 'reddit.com', 'redd.it',
  'twitch.tv', 'kick.com', 'trovo.live', 'rumble.com', 'pinterest.com', 'pin.it',
  'linkedin.com', 'threads.net', 'vk.com', 't.me', 'telegram.org', 'bilibili.com',
  'b23.tv', 'streamable.com', 'odysee.com'
];

function uiText(key) {
  return UI_STRINGS[uiLanguage]?.[key] || UI_STRINGS.ar[key] || key;
}

function ensureFfmpegReady() {
  if (!ffmpegStatic || !fs.existsSync(ffmpegStatic)) {
    throw new Error(uiText('ffmpegMissing'));
  }
}

function isNetflixUrl(url = '') {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    return host === 'netflix.com' || host.endsWith('.netflix.com');
  } catch {
    return /netflix\.com/i.test(String(url || ''));
  }
}

function assertNetflixNotBlocked(url) {
  if (isNetflixUrl(url)) {
    throw new Error(uiText('netflixDrmBlocked'));
  }
}

const supportedPlatforms = [
  { name: 'YouTube', patterns: ['youtube.com', 'youtu.be'], url: 'https://www.youtube.com' },
  { name: 'Instagram', patterns: ['instagram.com', 'instagr.am'], url: 'https://www.instagram.com' },
  { name: 'TikTok', patterns: ['tiktok.com'], url: 'https://www.tiktok.com' },
  { name: 'Facebook', patterns: ['facebook.com', 'fb.watch'], url: 'https://www.facebook.com' },
  { name: 'Twitter / X', patterns: ['twitter.com', 'x.com'], url: 'https://x.com' },
  { name: 'SoundCloud', patterns: ['soundcloud.com'], url: 'https://soundcloud.com' },
  { name: 'Pinterest', patterns: ['pinterest.com', 'pin.it'], url: 'https://www.pinterest.com' },
  { name: 'Spotify', patterns: ['spotify.com', 'open.spotify.com'], url: 'https://open.spotify.com' },
  { name: 'Twitch', patterns: ['twitch.tv'], url: 'https://www.twitch.tv' },
  { name: 'Kick', patterns: ['kick.com'], url: 'https://kick.com' },
  { name: 'Trovo', patterns: ['trovo.live'], url: 'https://trovo.live' },
  { name: 'LinkedIn', patterns: ['linkedin.com'], url: 'https://www.linkedin.com' },
  { name: 'Threads', patterns: ['threads.net'], url: 'https://www.threads.net' },
  { name: 'Rumble', patterns: ['rumble.com'], url: 'https://rumble.com' },
  { name: 'VK', patterns: ['vk.com'], url: 'https://vk.com' },
  { name: 'Telegram', patterns: ['t.me', 'telegram.org'], url: 'https://telegram.org' },
  { name: 'Bilibili', patterns: ['bilibili.com', 'b23.tv'], url: 'https://www.bilibili.com' },
  { name: 'Vimeo', patterns: ['vimeo.com'], url: 'https://vimeo.com' },
  { name: 'Dailymotion', patterns: ['dailymotion.com', 'dai.ly'], url: 'https://www.dailymotion.com' },
  { name: 'Reddit', patterns: ['reddit.com', 'redd.it'], url: 'https://www.reddit.com' },
  { name: 'Streamable', patterns: ['streamable.com'], url: 'https://streamable.com' },
  { name: 'Odysee', patterns: ['odysee.com'], url: 'https://odysee.com' },
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

  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    args.push('--extractor-args', 'youtube:player_client=android,web');
  }

  // Kick / live platforms — cookies + headers لتحسين تجاوز حماية API
  if (url && (url.includes('kick.com') || url.includes('trovo.live') || url.includes('twitch.tv'))) {
    const browser = getAvailableBrowserForCookies();
    if (browser) {
      args.push('--cookies-from-browser', browser);
    }
  }

  if (url && url.includes('kick.com')) {
    args.push('--add-header', 'Referer:https://kick.com/');
    args.push('--add-header', 'Origin:https://kick.com');
    args.push('--impersonate', 'chrome');
    args.push('--hls-use-mpegts');
  }

  if (url && (url.includes('twitch.tv') || url.includes('trovo.live'))) {
    args.push('--hls-use-mpegts');
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
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function killActiveDownload(reason = 'cancelled') {
  const child = activeDownloadChild;
  if (!child || child.killed) {
    activeDownloadChild = null;
    return false;
  }
  try {
    child.kill();
  } catch (err) {
    console.error('Failed to kill download process:', err);
  }
  activeDownloadChild = null;
  return true;
}

function trackDownloadChild(child) {
  activeDownloadChild = child;
  const clear = () => {
    if (activeDownloadChild === child) activeDownloadChild = null;
  };
  child.once('close', clear);
  child.once('error', clear);
  return child;
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
  assertNetflixNotBlocked(normalizedUrl);

  const cached = getCacheEntry(infoCache, normalizedUrl);
  if (cached) {
    sendStatus('info', 'تم تحميل البيانات من الذاكرة المؤقتة');
    return cached;
  }

  const baseFlags = getYtDlpBaseArgs(normalizedUrl);
  baseFlags.push('--no-playlist');

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

function formatHeightLabel(height) {
  const h = Number(height) || 0;
  if (h >= 4320) return `${h}p · 8K`;
  if (h >= 2160) return `${h}p · 4K UHD`;
  if (h >= 1440) return `${h}p · 2K QHD`;
  if (h >= 1080) return `${h}p · Full HD`;
  if (h >= 720) return `${h}p · HD`;
  if (h > 0) return `${h}p`;
  return 'Unknown';
}

function formatAudioLabel(abr) {
  const rate = Number(abr) || 0;
  if (rate >= 320) return `${rate}kbps · أقصى`;
  if (rate >= 256) return `${rate}kbps · فائق`;
  if (rate >= 192) return `${rate}kbps · عالي`;
  if (rate >= 128) return `${rate}kbps · متوسط`;
  if (rate > 0) return `${rate}kbps · منخفض`;
  return 'صوت';
}

function getAudioFormatSelector(options) {
  const abrRaw = options.abr;
  const formatId = options.format;

  if (!abrRaw || abrRaw === 'best' || formatId === 'best') {
    return 'bestaudio/bestaudio*/best';
  }

  const abr = Number(abrRaw);
  if (formatId && formatId !== 'best' && !Number.isFinite(Number(formatId))) {
    if (Number.isFinite(abr) && abr > 0) {
      return `${formatId}/bestaudio[abr<=${abr}]/bestaudio/best`;
    }
    return `${formatId}/bestaudio/best`;
  }

  if (Number.isFinite(abr) && abr > 0) {
    return `bestaudio[abr<=${abr}]/bestaudio/best`;
  }

  return 'bestaudio/bestaudio*/best';
}

function getMp3AudioQualityArg(options) {
  // 0 = أقصى جودة VBR بدون سقف عند اختيار "أفضل جودة"
  if (!options?.abr || options.abr === 'best' || options.format === 'best') {
    return '0';
  }
  const abr = Number(options.abr);
  if (Number.isFinite(abr) && abr > 0) {
    return `${Math.round(abr)}K`;
  }
  return '0';
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
            quality: formatHeightLabel(height),
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
          quality: abr > 0 ? formatAudioLabel(abr) : (format.format_note || 'صوت'),
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
  // الافتراضي: أقصى جودة متاحة بدون سقف (يشمل 4K/8K) ثم الدمج إلى mp4
  if (options.height === 'best' || !options.height) {
    return 'bestvideo+bestaudio/bestvideo*+bestaudio/best';
  }

  const height = Number(options.height);
  if (Number.isFinite(height) && height > 0) {
    // فوق 1080p لا نفضّل mp4 أولاً حتى لا يُستبعد 2K/4K/8K على يوتيوب
    if (height >= 1440) {
      return `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
    }
    return `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
  }

  return 'bestvideo+bestaudio/bestvideo*+bestaudio/best';
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
    return 'bestvideo/bestvideo*/best';
  }

  const height = Number(options.height);
  if (Number.isFinite(height) && height > 0) {
    if (height >= 1440) {
      return `bestvideo[height<=${height}]/best[height<=${height}]`;
    }
    return `bestvideo[height<=${height}][ext=mp4]/bestvideo[height<=${height}]/best[height<=${height}]`;
  }

  return 'bestvideo/bestvideo*/best';
}

function buildDownloadArgs(url, options, outputPath) {
  const rawName = options?.filename != null ? String(options.filename).trim() : '';
  const safeName = rawName && rawName !== 'undefined' ? rawName : '%(title)s.%(ext)s';
  const output = path.join(outputPath, safeName);
  const normalizedUrl = normalizeUrl(url);
  assertNetflixNotBlocked(normalizedUrl);
  const baseArgs = getYtDlpBaseArgs(normalizedUrl);
  baseArgs.push('--no-playlist');

  const args = [
    ...baseArgs,
    ...getSpeedArgs({ turbo: options.turbo !== false }),
    '--newline',
    '--progress'
  ];

  if (options.type === 'audio') {
    args.push(
      '-f', getAudioFormatSelector(options),
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', getMp3AudioQualityArg(options)
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
  const heightRaw = options.height;
  const heightNum = Number(heightRaw);
  const hasHeight = heightRaw && heightRaw !== 'best' && Number.isFinite(heightNum) && heightNum > 0;
  const abrNum = Number(options.abr);
  const hasAbr = options.abr && options.abr !== 'best' && Number.isFinite(abrNum) && abrNum > 0;

  // صوت فقط — رابط واحد مناسب لعنصر <video>/<audio>
  if (type === 'audio' || options.mode === 'audio') {
    if (hasAbr) {
      return `bestaudio[abr<=${abrNum}]/bestaudio/best`;
    }
    return 'bestaudio/bestaudio*/best';
  }

  // فيديو فقط — بدون صوت
  if (type === 'video-only') {
    if (hasHeight) {
      if (heightNum >= 1440) {
        return `bestvideo[height<=${heightNum}]/best[height<=${heightNum}]/bestvideo/best`;
      }
      return `bestvideo[height<=${heightNum}][ext=mp4]/bestvideo[height<=${heightNum}]/best[height<=${heightNum}]/bestvideo/best`;
    }
    return 'bestvideo/bestvideo*/best';
  }

  // فيديو + صوت: صيغة مدمجة واحدة فقط (HTML5 لا يقبل bestvideo+bestaudio كرابطين)
  if (hasHeight) {
    return `best[height<=${heightNum}][vcodec!=none][acodec!=none]/best[height<=${heightNum}]/best`;
  }

  return 'best[vcodec!=none][acodec!=none]/best';
}

async function getStreamUrl(url, options = {}) {
  const normalizedUrl = normalizeUrl(url);
  const formatSelector = typeof options === 'boolean'
    ? (options ? 'bestvideo/best' : 'best[vcodec!=none][acodec!=none]/best')
    : getFormatSelectorForPreview(options);

  const cacheKey = `${normalizedUrl}:${formatSelector}`;
  if (!options?.forceRefresh) {
    const cached = getCacheEntry(streamUrlCache, cacheKey);
    if (cached) {
      return cached;
    }
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

  // إن وُجدت عدة روابط (فيديو+صوت منفصلان) نأخذ الأول فقط — لذلك نفضّل صيغاً مدمجة في المحدد
  const streamUrl = lines[0];
  setCacheEntry(streamUrlCache, cacheKey, streamUrl, STREAM_CACHE_TTL);
  return streamUrl;
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

function cropImageWithFFmpeg(inputPath, outputPath, cropOption, customWidth, customHeight, maskShape = 'rect', cropPos = { x: 50, y: 50 }, outputSize = 'original', cropRect = null) {
  return new Promise((resolve) => {
    const filters = [];

    // قص يدوي بإطار الماوس (نسب مئوية من الصورة)
    if (cropRect && Number(cropRect.w) > 0 && Number(cropRect.h) > 0) {
      const x = Math.max(0, Math.min(99, Number(cropRect.x) || 0));
      const y = Math.max(0, Math.min(99, Number(cropRect.y) || 0));
      const w = Math.max(1, Math.min(100 - x, Number(cropRect.w) || 100));
      const h = Math.max(1, Math.min(100 - y, Number(cropRect.h) || 100));
      filters.push(`crop=iw*${w}/100:ih*${h}/100:iw*${x}/100:ih*${y}/100`);
    } else {
      const normX = Math.max(0, Math.min(100, Number(cropPos.x) || 50)) / 100;
      const normY = Math.max(0, Math.min(100, Number(cropPos.y) || 50)) / 100;

      if (cropOption === '1:1') {
        filters.push(`crop='min(iw\\,ih)':'min(iw\\,ih)':(iw-ow)*${normX}:(ih-oh)*${normY}`);
      } else if (cropOption === '9:16') {
        filters.push(`crop='if(gt(iw/ih\\,9/16)\\,ih*9/16\\,iw)':'if(gt(iw/ih\\,9/16)\\,ih\\,iw*16/9)':(iw-ow)*${normX}:(ih-oh)*${normY}`);
      } else if (cropOption === '4:5') {
        filters.push(`crop='if(gt(iw/ih\\,4/5)\\,ih*4/5\\,iw)':'if(gt(iw/ih\\,4/5)\\,ih\\,iw*5/4)':(iw-ow)*${normX}:(ih-oh)*${normY}`);
      } else if (cropOption === '16:9') {
        filters.push(`crop='if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw)':'if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16)':(iw-ow)*${normX}:(ih-oh)*${normY}`);
      } else if (cropOption === '21:9') {
        filters.push(`crop='if(gt(iw/ih\\,21/9)\\,ih*21/9\\,iw)':'if(gt(iw/ih\\,21/9)\\,ih\\,iw*9/21)':(iw-ow)*${normX}:(ih-oh)*${normY}`);
      }
    }

    const w = Math.max(64, Math.min(7680, Number(customWidth) || 1080));
    const h = Math.max(64, Math.min(7680, Number(customHeight) || 1080));

    if (cropOption === 'custom' || outputSize === 'custom') {
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    } else if (outputSize === '720') {
      filters.push('scale=\'if(gt(iw\\,ih)\\,720\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,720)\'');
    } else if (outputSize === '1080') {
      filters.push('scale=\'if(gt(iw\\,ih)\\,1080\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,1080)\'');
    } else if (outputSize === '480') {
      filters.push('scale=\'if(gt(iw\\,ih)\\,480\\,-2)\':\'if(gt(iw\\,ih)\\,-2\\,480)\'');
    }

    if (maskShape === 'circle') {
      filters.push('format=rgba');
      filters.push("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-W/2\\,Y-H/2)\\,min(W\\,H)/2)\\,255\\,0)'");
    } else if (maskShape === 'rounded') {
      filters.push('format=rgba');
    }

    if (filters.length === 0) {
      resolve({ success: true, path: inputPath });
      return;
    }

    const ext = path.extname(outputPath).toLowerCase();
    const tempOutput = path.join(path.dirname(outputPath), `_cropped_${Date.now()}${ext || '.png'}`);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vf', filters.join(','), '-y'];

    if (maskShape === 'circle' && (ext === '.jpg' || ext === '.jpeg')) {
      args.push('-vcodec', 'png');
    }

    args.push(tempOutput);
    const child = spawn(ffmpegStatic, args, { windowsHide: true });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutput)) {
        let finalPath = outputPath;
        if (maskShape === 'circle' && (ext === '.jpg' || ext === '.jpeg')) {
          finalPath = outputPath.replace(/\.(jpe?g)$/i, '.png');
        }
        try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch {}
        try {
          fs.renameSync(tempOutput, finalPath);
        } catch {
          try {
            fs.copyFileSync(tempOutput, finalPath);
            fs.unlinkSync(tempOutput);
          } catch {}
        }
        try { if (finalPath !== inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
        resolve({ success: true, path: finalPath });
      } else {
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch {}
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
    const child = trackDownloadChild(spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    }));

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
    child.on('close', (code, signal) => {
      if (code === 0) {
        sendDownloadProgress(progressEnd);
        resolve();
        return;
      }
      if (signal) {
        reject(new Error('تم إلغاء التحميل'));
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
    const child = trackDownloadChild(spawn(ytDlpPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' }
    }));

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

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve({ success: true, path: output });
        return;
      }

      if (signal) {
        reject(new Error('تم إلغاء التحميل'));
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

ipcMain.handle('cancel-download', () => {
  const killed = killActiveDownload('user-cancel');
  return { success: true, cancelled: killed };
});

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

function normalizeChannelCheckUrl(rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  try {
    const u = new URL(normalized);
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
  return normalized;
}

async function fetchChannelLatestEntries(channelUrl, limit = 8) {
  await waitForYtDlp();
  const url = normalizeChannelCheckUrl(channelUrl);
  const baseFlags = getYtDlpBaseArgs(url);
  const max = Math.max(1, Math.min(20, Number(limit) || 8));

  const output = await runYtDlp([
    ...baseFlags,
    '--flat-playlist',
    '--skip-download',
    '--playlist-end', String(max),
    '--print', '%(id)s\t%(title)s\t%(webpage_url)s\t%(uploader,channel,playlist_title,playlist)s',
    url
  ]);

  const entries = [];
  let channelName = '';
  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('\t')) continue;
    const [id, title, webpageUrl, uploader] = trimmed.split('\t');
    if (!id || id === 'NA') continue;
    if (uploader && uploader !== 'NA' && !channelName) {
      channelName = uploader;
    }
    let videoUrl = webpageUrl && webpageUrl !== 'NA' ? webpageUrl : '';
    if (!videoUrl) {
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) {
        videoUrl = `https://www.youtube.com/watch?v=${id}`;
      } else {
        videoUrl = url;
      }
    }
    entries.push({
      id: String(id),
      title: title && title !== 'NA' ? title : String(id),
      url: videoUrl
    });
  }

  return { channelName, entries, checkedUrl: url };
}

ipcMain.handle('check-channel-updates', async (event, data = {}) => {
  try {
    const url = String(data.url || '').trim();
    if (!url) {
      return { success: false, error: 'رابط القناة مطلوب' };
    }
    const result = await fetchChannelLatestEntries(url, data.limit || 8);
    return {
      success: true,
      data: {
        name: result.channelName || '',
        entries: result.entries,
        checkedUrl: result.checkedUrl
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'فشل فحص القناة'
    };
  }
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
    assertNetflixNotBlocked(url);
    ensureFfmpegReady();
    const outputDir = await resolveOutputDirectory(options?.downloadDir);

    if (options.mode === 'image') {
      const imageFormat = options.imageFormat || 'png';
      let outputPath = path.join(outputDir, `${options.filename}.${imageFormat}`);
      sendDownloadProgress(10, { message: 'جاري تجهيز الصورة...' });

      let res;
      if (options.imageMode === 'thumbnail') {
        res = await downloadThumbnailImage(options.thumbnailUrl, outputPath);
        sendDownloadProgress(55, { message: 'جاري تحويل صيغة الصورة...' });
        const converted = await convertImageFormatWithFFmpeg(outputPath, outputPath, imageFormat);
        if (converted?.path) {
          outputPath = converted.path;
          res = { success: true, path: outputPath };
        }
      } else {
        sendDownloadProgress(30, { message: 'جاري استخراج اللقطة...' });
        res = await downloadFrameImage(url, Number(options.frameTime) || 0, outputPath, imageFormat);
        if (res?.path) outputPath = res.path;
      }

      const needsCrop = options.cropEnabled
        || (options.cropRect && options.cropRect.w > 0)
        || (options.aspectRatio && options.aspectRatio !== 'default')
        || (options.outputSize && options.outputSize !== 'original')
        || (options.maskShape && options.maskShape !== 'rect');

      if (needsCrop) {
        sendDownloadProgress(75, { message: 'جاري تطبيق القص والأبعاد...' });
        const cropped = await cropImageWithFFmpeg(
          outputPath,
          outputPath,
          options.aspectRatio || 'default',
          options.customWidth,
          options.customHeight,
          options.maskShape || 'rect',
          options.cropPos || { x: 50, y: 50 },
          options.outputSize || 'original',
          options.cropEnabled ? options.cropRect : null
        );
        if (cropped?.path) {
          outputPath = cropped.path;
          res = { success: true, path: outputPath };
        }
      }

      sendDownloadProgress(100, { message: 'اكتمل حفظ الصورة' });
      if (!res?.success || !outputPath || !fs.existsSync(outputPath)) {
        return { success: false, error: 'تعذر حفظ ملف الصورة' };
      }
      return { success: true, path: outputPath };
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

ipcMain.handle('open-external-url', async (event, rawUrl) => {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'رابط غير صالح' };
    }
    await shell.openExternal(parsed.toString());
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'تعذر فتح الموقع' };
  }
});

ipcMain.handle('open-downloads', async (event, customPath) => {
  const targetFolder = (customPath && fs.existsSync(customPath))
    ? customPath
    : app.getPath('downloads');
  shell.openPath(targetFolder);
});

ipcMain.handle('open-path', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'مسار الملف غير صالح' };
  }
  const normalized = path.normalize(filePath);
  if (!fs.existsSync(normalized)) {
    return { success: false, error: 'الملف غير موجود' };
  }
  try {
    const errMsg = await shell.openPath(normalized);
    if (errMsg) {
      // إن فشل فتح الملف بالتطبيق الافتراضي، افتح المجلد وحدّد الملف
      shell.showItemInFolder(normalized);
      return { success: false, error: errMsg, openedFolder: true };
    }
    return { success: true, path: normalized };
  } catch (error) {
    try {
      shell.showItemInFolder(normalized);
    } catch {}
    return { success: false, error: error.message || 'تعذر فتح الملف' };
  }
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
    killActiveDownload('app-close');
    if (clipboardWatchInterval) {
      clearInterval(clipboardWatchInterval);
      clipboardWatchInterval = null;
    }
    stopBatchAutoPasteWatcher();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    killActiveDownload('before-quit');
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
