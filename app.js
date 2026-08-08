// Full-Screen Splash Screen Auto Dismiss
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('is-done');
      splash.style.opacity = '0';
      splash.style.visibility = 'hidden';
      splash.style.pointerEvents = 'none';
      setTimeout(() => splash.remove(), 600);
    }
  }, 1200);
});

let deferredPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installAppBtn) installAppBtn.classList.remove('hidden');
});

installAppBtn?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installAppBtn.classList.add('hidden');
    }
    deferredPrompt = null;
  }
});

// Register Service Worker for PWA — keep /api downloads off the cache
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.update().catch(() => {});
  }).catch(() => {});
}

// Mobile App State
let currentVideoInfo = null;
let selectedHeight = 'best';
let selectedAudioAbr = 'best';
let downloadType = 'video-audio';
let studioMode = 'full';
let imageMode = 'thumbnail';
let imageFormat = document.querySelector('.img-fmt-btn.active')?.dataset.fmt || 'png';
let imageAspect = 'default';
let imageOutputSize = 'original';
let maskShape = 'rect';
function loadMobileHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem('vm_mobile_history') || '[]');
    downloadHistory = Array.isArray(raw) ? raw : [];
  } catch {
    downloadHistory = [];
  }
  return downloadHistory;
}

let downloadHistory = [];
loadMobileHistory();
let batchQueue = [];
let isBatchProcessing = false;
const MOBILE_FAV_PAGE_SIZE = 100;
let mobileFavorites = [];
let mobileFavPage = 0;
let mobileFavExpandedId = null;
let mobileFavGlobalInboxOpen = false;
let mobileFavChecking = false;
const MOBILE_WL_PAGE_SIZE = 100;
let mobileWatchLater = [];
let mobileWatchLaterFilter = 'all';
let mobileWatchLaterPage = 0;

function guessMobileChannelName(url) {
  try {
    const u = new URL(url);
    const m =
      u.pathname.match(/\/@([^/]+)/) ||
      u.pathname.match(/\/c\/([^/]+)/) ||
      u.pathname.match(/\/user\/([^/]+)/) ||
      u.pathname.match(/\/channel\/([^/]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function cleanMobileChannelName(name) {
  if (!name) return '';
  let s = String(name).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  try { s = decodeURIComponent(s); } catch { /* keep */ }
  s = s.replace(/^(Uploads from|Videos from|Streams from)\s+/i, '').trim();
  s = s.replace(/\s*[-–—|]\s*(Videos|Streams|Shorts|Live|Releases|Playlists|Uploads|Home|Featured|فيديوهات|مقاطع|مباشر)\s*$/i, '').trim();
  if (!s || /^(videos|streams|shorts|live|uploads|home|featured|na)$/i.test(s)) return '';
  if (/^UC[\w-]{20,}$/i.test(s)) return '';
  return s;
}

function preferMobileChannelName(existing, fetched, url) {
  const fetchedName = cleanMobileChannelName(fetched);
  const existingName = cleanMobileChannelName(existing);
  const isWeak = (name) => {
    if (!name) return true;
    try {
      const u = new URL(url);
      if (name.toLowerCase() === u.hostname.replace(/^www\./i, '').toLowerCase()) return true;
    } catch { /* ignore */ }
    return false;
  };
  if (fetchedName && !isWeak(fetchedName)) return fetchedName;
  if (existingName && !isWeak(existingName)) return existingName;
  return fetchedName || existingName || guessMobileChannelName(url);
}

function loadMobileFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem('vm_mobile_favorites') || '[]');
    if (!Array.isArray(raw)) {
      mobileFavorites = [];
      return;
    }
    mobileFavorites = raw.filter((c) => c && c.url).map((c) => ({
      id: c.id || `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: c.url,
      name: c.name || guessMobileChannelName(c.url),
      lastSeenIds: Array.isArray(c.lastSeenIds) ? c.lastSeenIds : [],
      unread: Array.isArray(c.unread) ? c.unread.map((u) => ({
        id: u.id,
        title: u.title || u.id,
        url: u.url || '',
        addedAt: u.addedAt || Date.now(),
        read: !!u.read
      })) : [],
      lastChecked: c.lastChecked || 0,
      notifyEnabled: c.notifyEnabled !== false
    }));
  } catch {
    mobileFavorites = [];
  }
}
loadMobileFavorites();

const elements = {
  videoUrl: document.getElementById('videoUrl'),
  fetchBtn: document.getElementById('fetchBtn'),
  pasteBtn: document.getElementById('pasteBtn'),
  clearBtn: document.getElementById('clearBtn'),
  loadingState: document.getElementById('loadingState'),
  videoCard: document.getElementById('videoCard'),
  downloadOptions: document.getElementById('downloadOptions'),
  progressContainer: document.getElementById('progressContainer'),
  successMessage: document.getElementById('successMessage'),
  thumbnailImg: document.getElementById('thumbnailImg'),
  durationBadge: document.getElementById('durationBadge'),
  videoTitle: document.getElementById('videoTitle'),
  uploaderName: document.getElementById('uploaderName'),
  videoPreviewCard: document.getElementById('videoPreviewCard'),
  globalSettingsBadge: document.getElementById('globalSettingsBadge'),
  videoEmbedContainer: document.getElementById('videoEmbedContainer'),
  refreshPreviewBtn: document.getElementById('refreshPreviewBtn'),
  studioPanel: document.getElementById('studioPanel'),
  studioModeTabs: document.getElementById('studioModeTabs'),
  clipWorkspace: document.getElementById('clipWorkspace'),
  clipVideoDurationLabel: document.getElementById('clipVideoDurationLabel'),
  clipDurationLabel: document.getElementById('clipDurationLabel'),
  clipRangeLabel: document.getElementById('clipRangeLabel'),
  clipStartRange: document.getElementById('clipStartRange'),
  clipEndRange: document.getElementById('clipEndRange'),
  clipStartValue: document.getElementById('clipStartValue'),
  clipEndValue: document.getElementById('clipEndValue'),
  clipDualSelection: document.getElementById('clipDualSelection'),
  presetFirst30: document.getElementById('presetFirst30'),
  presetFullMin: document.getElementById('presetFullMin'),
  presetMiddle: document.getElementById('presetMiddle'),
  presetLast30: document.getElementById('presetLast30'),
  imageWorkspace: document.getElementById('imageWorkspace'),
  imgModeThumb: document.getElementById('imgModeThumb'),
  imgModeFrame: document.getElementById('imgModeFrame'),
  imageModeTitle: document.getElementById('imageModeTitle'),
  imageModeDesc: document.getElementById('imageModeDesc'),
  thumbPreviewBox: document.getElementById('thumbPreviewBox'),
  thumbPreviewImg: document.getElementById('thumbPreviewImg'),
  frameSeekWrap: document.getElementById('frameSeekWrap'),
  frameSeekRange: document.getElementById('frameSeekRange'),
  frameSeekLabel: document.getElementById('frameSeekLabel'),
  aspectBadge: document.getElementById('aspectBadge'),
  customAspectInputs: document.getElementById('customAspectInputs'),
  customAspectWidth: document.getElementById('customAspectWidth'),
  customAspectHeight: document.getElementById('customAspectHeight'),
  aiDubWorkspace: document.getElementById('aiDubWorkspace'),
  aiDubInfoText: document.getElementById('aiDubInfoText'),
  aiDubStatusBadge: document.getElementById('aiDubStatusBadge'),
  dubTargetLangSelect: document.getElementById('dubTargetLangSelect'),
  dubVoiceProfileSelect: document.getElementById('dubVoiceProfileSelect'),
  dubModeSelect: document.getElementById('dubModeSelect'),
  unifiedQualityGrid: document.getElementById('unifiedQualityGrid'),
  filenameInput: document.getElementById('filenameInput'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadBtnText: document.getElementById('downloadBtnText'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  progressInfo: document.getElementById('progressInfo'),
  successPath: document.getElementById('successPath'),
  newDownloadBtn: document.getElementById('newDownloadBtn'),
  studioPanel: document.getElementById('studioPanel'),
  historyList: document.getElementById('historyList'),
  platformsGrid: document.getElementById('platformsGrid'),
  
  // 3 Action Buttons Parity Elements
  chooseFolderBtn: document.getElementById('chooseFolderBtn'),
  openFolderBtn: document.getElementById('openFolderBtn'),
  quickPlayBtn: document.getElementById('quickPlayBtn'),
  playLastVideoBtn: document.getElementById('playLastVideoBtn'),
  
  // Settings & System Health Elements
  languageSelect: document.getElementById('languageSelect'),
  defaultQualitySelect: document.getElementById('defaultQualitySelect'),
  speedLimitSelect: document.getElementById('settingSpeedLimit'),
  autoRetrySelect: document.getElementById('settingAutoRetryCount'),
  scheduleTimeInput: document.getElementById('settingScheduleTime'),
  scheduleDelayInput: document.getElementById('settingScheduleDelayMin'),
  scheduleStartBtn: document.getElementById('settingStartScheduleBtn'),
  scheduleCancelBtn: document.getElementById('settingCancelScheduleBtn'),
  scheduleStatus: document.getElementById('settingScheduleStatus'),
  customDownloadPath: document.getElementById('customDownloadPath'),
  browseDownloadPathBtn: document.getElementById('browseDownloadPathBtn'),
  choosePathBtn: document.getElementById('choosePathBtn'),
  openLastVideoFolderBtn: document.getElementById('openLastVideoFolderBtn'),
  turboMode: document.getElementById('turboMode'),
  audioEnhanceToggle: document.getElementById('audioEnhanceToggle'),
  autoClipboardToggle: document.getElementById('autoClipboardToggle'),
  notificationsToggle: document.getElementById('notificationsToggle'),
  downloadWifiOnlyBtn: document.getElementById('downloadWifiOnlyBtn'),
  downloadCellularBtn: document.getElementById('downloadCellularBtn'),
  downloadBothBtn: document.getElementById('downloadBothBtn'),
  clearCacheBtn: document.getElementById('clearCacheBtn'),
  repairSystemBtn: document.getElementById('repairSystemBtn'),
  ytDlpHealth: document.getElementById('ytDlpHealth'),
  ffmpegHealth: document.getElementById('ffmpegHealth'),

  // Settings Batch Queue Elements
  settingsBatchUrlsText: document.getElementById('settingsBatchUrlsText'),
  settingsPasteAddBatchBtn: document.getElementById('settingsPasteAddBatchBtn'),
  settingsStartBatchBtn: document.getElementById('settingsStartBatchBtn'),
  settingsClearBatchBtn: document.getElementById('settingsClearBatchBtn'),
  settingsBatchQueueList: document.getElementById('settingsBatchQueueList'),
  
  // Batch Queue Elements
  batchToggleBtn: document.getElementById('batchToggleBtn'),
  batchQueuePanel: document.getElementById('batchQueuePanel'),
  closeBatchBtn: document.getElementById('closeBatchBtn'),
  batchUrlsText: document.getElementById('batchUrlsText'),
  pasteAddBatchBtn: document.getElementById('pasteAddBatchBtn'),
  batchAutoPasteBtn: document.getElementById('batchAutoPasteBtn'),
  startBatchBtn: document.getElementById('startBatchBtn'),
  clearBatchBtn: document.getElementById('clearBatchBtn'),
  batchQueueList: document.getElementById('batchQueueList'),
  batchProgressHint: document.getElementById('batchProgressHint')
};

// Studio Mode Tabs Handler (4 Tabs: Full, Clip, Image, AI Dub)
let aiDubSubmode = 'dub_only';

document.querySelectorAll('.mobile-studio-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mobile-studio-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    studioMode = tab.dataset.mode || 'full';

    elements.clipWorkspace?.classList.add('hidden');
    elements.imageWorkspace?.classList.add('hidden');
    elements.aiDubWorkspace?.classList.add('hidden');

    if (studioMode === 'clip') elements.clipWorkspace?.classList.remove('hidden');
    if (studioMode === 'image') {
      elements.imageWorkspace?.classList.remove('hidden');
      updateImageModeUi();
    }
    if (studioMode === 'aidub') elements.aiDubWorkspace?.classList.remove('hidden');

    document.getElementById('downloadTypeTabs')?.classList.toggle('hidden', studioMode !== 'full');
    document.getElementById('unifiedQualityGrid')?.classList.toggle('hidden', studioMode === 'image');

    updateDownloadButtonText();
    updateGlobalSettingsBadge();
    renderQualityGrid();
    refreshLivePreview();
  });
});

function updateImageModeUi() {
  const isFrame = imageMode === 'frame';
  const title = isFrame ? (t('frame') || 'لقطة من الفيديو') : (t('thumbnail') || 'الصورة المصغرة');
  const desc = isFrame ? (t('frameDesc') || 'استخراج إطار من وقت محدد') : (t('thumbnailDesc') || 'تحميل غلاف الفيديو الأصلي');
  if (elements.imageModeTitle) elements.imageModeTitle.textContent = title;
  if (elements.imageModeDesc) elements.imageModeDesc.textContent = desc;
  if (elements.imgModeThumb) {
    elements.imgModeThumb.title = t('thumbnail') || 'الصورة المصغرة';
    elements.imgModeThumb.classList.toggle('active', !isFrame);
  }
  if (elements.imgModeFrame) {
    elements.imgModeFrame.title = t('frame') || 'لقطة من الفيديو';
    elements.imgModeFrame.classList.toggle('active', isFrame);
  }
  elements.thumbPreviewBox?.classList.toggle('hidden', isFrame);
  elements.frameSeekWrap?.classList.toggle('hidden', !isFrame);
  if (!isFrame && elements.thumbPreviewImg && currentVideoInfo) {
    bindCoverImageFallbacks(elements.thumbPreviewImg, youtubeCoverCandidates(currentVideoInfo));
  }
  if (isFrame) showImageFramePreview(Number(elements.frameSeekRange?.value || 0), true);
  else refreshLivePreview();
}

function getClipExportType() {
  return document.querySelector('input[name="clipAudioMode"]:checked')?.value || 'video-audio';
}

function getActiveExportType() {
  return studioMode === 'clip' ? getClipExportType() : downloadType;
}

function updateDownloadButtonText() {
  const exportType = getActiveExportType();
  const audioOnly = exportType === 'audio';
  const videoOnly = exportType === 'video-only';
  const titles = {
    full: audioOnly
      ? (t('downloadAudioOnly') || 'تحميل صوت فقط')
      : videoOnly
        ? (t('downloadVideoOnly') || 'فيديو بدون صوت')
        : (t('downloadVideoAudio') || t('videoAudio') || 'فيديو مع صوت'),
    clip: audioOnly
      ? (t('typeClipAudioOnly') || 'مقطع صوت فقط')
      : videoOnly
        ? (t('typeClipNoAudio') || 'مقطع بدون صوت')
        : (t('typeClipAudio') || 'مقطع مع صوت'),
    image: imageMode === 'frame'
      ? (t('extractFrame') || 'استخراج اللقطة')
      : (t('downloadThumbnail') || 'تحميل الصورة المصغرة')
  };
  if (elements.downloadBtn) elements.downloadBtn.title = titles[studioMode] || 'تحميل';
  if (!elements.downloadBtnText) return;
  elements.downloadBtnText.textContent = titles[studioMode] || 'تحميل';
}

// Clip Range Sliders & Presets
let clipSeekWhich = 'start';
let seekPreviewReq = 0;
let seekPreviewTimer = 0;
let seekPreviewBlobUrl = '';

function resetClipPreviewState() {
  seekPreviewReq += 1;
  clearTimeout(seekPreviewTimer);
  if (seekPreviewBlobUrl) {
    URL.revokeObjectURL(seekPreviewBlobUrl);
    seekPreviewBlobUrl = '';
  }
  const video = document.getElementById('clipPreviewVideo');
  if (video) {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function constrainClipRange(which) {
  const startEl = elements.clipStartRange;
  const endEl = elements.clipEndRange;
  if (!startEl || !endEl) return;
  const minGap = Math.max(0.1, Number(startEl.step) || 0.1);
  let start = Number(startEl.value);
  let end = Number(endEl.value);
  const max = Number(endEl.max) || 0;
  if (which === 'start' && start > end - minGap) {
    start = Math.max(0, end - minGap);
    startEl.value = String(start);
  }
  if (which === 'end' && end < start + minGap) {
    end = Math.min(max, start + minGap);
    endEl.value = String(end);
  }
}

function updateClipDualSelection() {
  const startEl = elements.clipStartRange;
  const endEl = elements.clipEndRange;
  const sel = elements.clipDualSelection;
  if (!startEl || !endEl || !sel) return;
  const max = Math.max(1, Number(startEl.max) || 1);
  const start = Math.max(0, Number(startEl.value) || 0);
  const end = Math.max(start, Number(endEl.value) || 0);
  sel.style.left = `${(start / max) * 100}%`;
  sel.style.width = `${((end - start) / max) * 100}%`;
}

function updateClipSeekOverlay(seconds, which = 'start') {
  const embed = elements.videoEmbedContainer;
  if (!embed) return;
  let overlay = document.getElementById('clipSeekOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'clipSeekOverlay';
    embed.appendChild(overlay);
  }
  const isEnd = which === 'end';
  overlay.className = `clip-seek-overlay ${isEnd ? 'end' : 'start'}`;
  overlay.textContent = `${isEnd ? (t('clipEndHandle') || t('end') || 'نهاية القص') : (t('clipStartHandle') || t('start') || 'بداية القص')} · ${formatDuration(seconds)}`;
}

function ensureSeekPreviewDom() {
  const embed = elements.videoEmbedContainer;
  if (!embed) return {};
  embed.querySelector('iframe')?.remove();
  document.getElementById('clipPreviewVideo')?.remove();
  document.getElementById('clipPreviewFallback')?.remove();

  let cover = embed.querySelector('.live-preview-cover');
  let img = document.getElementById('livePreviewCoverImg');
  if (!cover || !img) {
    embed.innerHTML = `
      <div class="live-preview-cover">
        <img id="livePreviewCoverImg" alt="">
        <span class="live-preview-caption" id="livePreviewCaption"></span>
      </div>`;
    cover = embed.querySelector('.live-preview-cover');
    img = document.getElementById('livePreviewCoverImg');
  }
  let cap = document.getElementById('livePreviewCaption');
  if (!cap && cover) {
    cap = document.createElement('span');
    cap.id = 'livePreviewCaption';
    cap.className = 'live-preview-caption';
    cover.appendChild(cap);
  }
  if (img) {
    img.style.display = 'block';
    img.style.opacity = img.style.opacity || '1';
  }
  return { cover, img, cap, embed };
}

function paintSeekPreview(seconds, label, immediate = false) {
  if (!currentVideoInfo?.url || !elements.videoEmbedContainer) return;
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const caption = `${label} · ${formatDuration(t)}`;
  const { img, cap } = ensureSeekPreviewDom();
  if (cap) cap.textContent = caption;
  updateGlobalSettingsBadge();
  if (studioMode === 'image') applyLiveImagePreview();

  const run = async () => {
    const req = ++seekPreviewReq;
    const liveImg = document.getElementById('livePreviewCoverImg') || img;
    const liveCap = document.getElementById('livePreviewCaption') || cap;
    if (!liveImg) return;
    if (liveCap) liveCap.textContent = `${caption} · …`;
    liveImg.style.opacity = '0.55';
    try {
      const res = await fetch(`/api/preview-frame?url=${encodeURIComponent(currentVideoInfo.url)}&t=${t}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`preview ${res.status}`);
      const blob = await res.blob();
      if (req !== seekPreviewReq) return;
      if (!blob || blob.size < 400) throw new Error('empty-frame');
      if (seekPreviewBlobUrl) URL.revokeObjectURL(seekPreviewBlobUrl);
      seekPreviewBlobUrl = URL.createObjectURL(blob);
      liveImg.onload = () => {
        liveImg.style.opacity = '1';
        if (studioMode === 'image') applyLiveImagePreview();
      };
      liveImg.onerror = () => { liveImg.style.opacity = '1'; };
      liveImg.src = seekPreviewBlobUrl;
      liveImg.dataset.seekT = String(t);
      if (liveCap) liveCap.textContent = caption;
    } catch {
      if (req !== seekPreviewReq) return;
      liveImg.style.opacity = '1';
      if (liveCap) liveCap.textContent = `${caption} · تعذر الجلب`;
    }
  };

  clearTimeout(seekPreviewTimer);
  if (immediate) run();
  else seekPreviewTimer = setTimeout(run, 200);
}

function seekClipPreview(seconds, which = 'start', immediate = false) {
  clipSeekWhich = which === 'end' ? 'end' : 'start';
  if (!currentVideoInfo || !elements.videoEmbedContainer) return;
  const t = Math.max(0, Number(seconds) || 0);
  updateClipSeekOverlay(t, clipSeekWhich);
  updateGlobalSettingsBadge();
  const label = clipSeekWhich === 'end'
    ? (t('clipEndHandle') || t('end') || 'نهاية القص')
    : (t('clipStartHandle') || t('start') || 'بداية القص');
  paintSeekPreview(t, label, immediate);
}

function updateClipRangeDisplay() {
  if (!elements.clipStartRange || !elements.clipEndRange) return;
  const startSec = Number(elements.clipStartRange.value || 0);
  const endSec = Number(elements.clipEndRange.value || 30);
  const durSec = Math.max(0.1, endSec - startSec);

  if (elements.clipStartValue) elements.clipStartValue.textContent = formatDuration(startSec);
  if (elements.clipEndValue) elements.clipEndValue.textContent = formatDuration(endSec);
  if (elements.clipDurationLabel) elements.clipDurationLabel.textContent = formatDuration(durSec);
  if (elements.clipRangeLabel) elements.clipRangeLabel.textContent = `${formatDuration(startSec)} → ${formatDuration(endSec)}`;
  updateClipDualSelection();
  updateGlobalSettingsBadge();
}

function raiseClipHandle(which) {
  if (elements.clipStartRange) elements.clipStartRange.style.zIndex = which === 'start' ? '4' : '2';
  if (elements.clipEndRange) elements.clipEndRange.style.zIndex = which === 'end' ? '4' : '2';
}

elements.clipStartRange?.addEventListener('pointerdown', () => raiseClipHandle('start'));
elements.clipEndRange?.addEventListener('pointerdown', () => raiseClipHandle('end'));

elements.clipStartRange?.addEventListener('input', () => {
  constrainClipRange('start');
  updateClipRangeDisplay();
  seekClipPreview(Number(elements.clipStartRange.value), 'start');
});
elements.clipEndRange?.addEventListener('input', () => {
  constrainClipRange('end');
  updateClipRangeDisplay();
  seekClipPreview(Number(elements.clipEndRange.value), 'end');
});
updateClipRangeDisplay();

elements.presetFirst30?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  elements.clipStartRange.value = 0;
  elements.clipEndRange.value = Math.min(30, currentVideoInfo.duration || 30);
  updateClipRangeDisplay();
  seekClipPreview(0, 'start', true);
});

elements.presetFullMin?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  elements.clipStartRange.value = 0;
  elements.clipEndRange.value = Math.min(60, currentVideoInfo.duration || 60);
  updateClipRangeDisplay();
  seekClipPreview(0, 'start', true);
});

elements.presetMiddle?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  const total = currentVideoInfo.duration || 120;
  const mid = Math.floor(total / 2);
  elements.clipStartRange.value = Math.max(0, mid - 15);
  elements.clipEndRange.value = Math.min(total, mid + 15);
  updateClipRangeDisplay();
  seekClipPreview(Number(elements.clipStartRange.value), 'start', true);
});

elements.presetLast30?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  const total = currentVideoInfo.duration || 120;
  elements.clipStartRange.value = Math.max(0, total - 30);
  elements.clipEndRange.value = total;
  updateClipRangeDisplay();
  seekClipPreview(Number(elements.clipStartRange.value), 'start', true);
});

document.querySelectorAll('input[name="clipAudioMode"]').forEach((input) => {
  input.addEventListener('change', () => {
    renderQualityGrid();
    updateDownloadButtonText();
    updateGlobalSettingsBadge();
    const kind = getClipExportType();
    if (kind === 'audio') showMobileToast(t('typeClipAudioOnly') || 'مقطع صوت فقط');
    else if (kind === 'video-only') showMobileToast(t('typeClipNoAudio') || 'مقطع بدون صوت');
    else showMobileToast(t('typeClipAudio') || 'مقطع مع صوت');
  });
});

// Image Mode & Format Selection
elements.imgModeThumb?.addEventListener('click', () => {
  imageMode = 'thumbnail';
  updateImageModeUi();
  updateDownloadButtonText();
});

elements.imgModeFrame?.addEventListener('click', () => {
  imageMode = 'frame';
  updateImageModeUi();
  updateDownloadButtonText();
});

document.querySelectorAll('.img-fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.img-fmt-btn').forEach(b => {
      b.classList.remove('active');
      b.style.background = 'transparent';
      b.style.color = 'var(--text-main)';
      b.style.fontWeight = 'normal';
    });
    btn.classList.add('active');
    btn.style.background = 'var(--primary)';
    btn.style.color = '#000';
    btn.style.fontWeight = 'bold';
    imageFormat = btn.dataset.fmt || 'jpg';
    updateGlobalSettingsBadge();
    refreshLivePreview();
  });
});

elements.frameSeekRange?.addEventListener('input', (e) => {
  imageMode = 'frame';
  const seek = Number(e.target.value || 0);
  if (elements.frameSeekLabel) {
    elements.frameSeekLabel.textContent = formatDuration(seek);
  }
  updateGlobalSettingsBadge();
  showImageFramePreview(seek);
});

document.querySelectorAll('#aspectPills .dim-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    imageAspect = pill.dataset.aspect || 'default';
    document.querySelectorAll('#aspectPills .dim-pill').forEach((item) => {
      item.classList.toggle('active', item.dataset.aspect === imageAspect);
    });
    applyLiveImagePreview();
  });
});

document.querySelectorAll('#outputSizePills .dim-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    imageOutputSize = pill.dataset.size || 'original';
    document.querySelectorAll('#outputSizePills .dim-pill').forEach((item) => {
      item.classList.toggle('active', item.dataset.size === imageOutputSize);
    });
    applyLiveImagePreview();
  });
});

document.querySelectorAll('#maskShapePills .dim-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    maskShape = pill.dataset.shape || 'rect';
    document.querySelectorAll('#maskShapePills .dim-pill').forEach((item) => {
      item.classList.toggle('active', item.dataset.shape === maskShape);
    });
    applyLiveImagePreview();
  });
});

const syncCustomDims = () => applyLiveImagePreview();
elements.customAspectWidth?.addEventListener('input', syncCustomDims);
elements.customAspectHeight?.addEventListener('input', syncCustomDims);

// AI Dubbing Sub-modes Handler
document.querySelectorAll('.aidub-submode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.aidub-submode-btn').forEach(b => {
      b.classList.remove('active');
      b.style.border = '1px solid rgba(255,255,255,0.1)';
      b.style.background = 'var(--bg-card)';
    });
    btn.classList.add('active');
    btn.style.border = '1px solid var(--primary)';
    btn.style.background = 'rgba(0,242,254,0.1)';
    aiDubSubmode = btn.dataset.submode || 'dub_only';

    if (elements.aiDubInfoText) {
      if (aiDubSubmode === 'sub_only') {
        elements.aiDubInfoText.textContent = 'الترجمة النصية تُدمج مع الفيديو مع الإبقاء على الصوت الأصلي';
      } else if (aiDubSubmode === 'dub_and_sub') {
        elements.aiDubInfoText.textContent = 'دبلجة صوتية بالذكاء الاصطناعي + ترجمة نصية مطبوعة (حفظ الموسيقى)';
      } else {
        elements.aiDubInfoText.textContent = 'الدبلجة الذكية: تُترجم الترجمة التلقائية ثم يُولَّد صوت جديد — يُزال الصوت الأصلي بالكامل';
      }
    }
    updateDownloadButtonText();
  });
});

const SETTINGS_KEYS = {
  turbo: 'vm_mobile_turbo',
  audioEnhance: 'vm_mobile_audio_enhance',
  clipboard: 'vm_mobile_auto_clipboard',
  notifications: 'vm_mobile_notifications',
  network: 'vm_mobile_download_network',
  speedLimit: 'vm_mobile_speed_limit',
  retries: 'vm_mobile_auto_retry'
};

const MOBILE_VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'tiktok.com',
  'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'soundcloud.com',
  'spotify.com', 'vimeo.com', 'dailymotion.com', 'dai.ly', 'reddit.com', 'redd.it',
  'twitch.tv', 'kick.com', 'trovo.live', 'rumble.com', 'pinterest.com', 'pin.it',
  'linkedin.com', 'threads.net', 'vk.com', 't.me', 'telegram.org', 'bilibili.com',
  'b23.tv', 'streamable.com', 'odysee.com'
];

function isSettingOn(key, defaultOn = true) {
  const value = localStorage.getItem(key);
  if (value === null) return defaultOn;
  return value !== 'false';
}

function isTurboEnabled() {
  return isSettingOn(SETTINGS_KEYS.turbo);
}

function isAudioEnhanceEnabled() {
  return isSettingOn(SETTINGS_KEYS.audioEnhance);
}

function isClipboardAutoEnabled() {
  return isSettingOn(SETTINGS_KEYS.clipboard);
}

function isNotificationsEnabled() {
  return isSettingOn(SETTINGS_KEYS.notifications);
}

function getDownloadNetworkMode() {
  const raw = localStorage.getItem(SETTINGS_KEYS.network);
  if (raw === 'wifi' || raw === 'cellular' || raw === 'both') return raw;
  if (raw === 'any') return 'both';
  return 'both';
}

function getMobileConnectionKind() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 'unknown';
  const type = String(conn.type || '').toLowerCase();
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  if (type === 'cellular' || type === 'wimax') return 'cellular';
  return 'unknown';
}

function getNetworkBlockMessage() {
  const mode = getDownloadNetworkMode();
  const net = getMobileConnectionKind();
  if (net === 'unknown' || mode === 'both') return '';
  if (mode === 'wifi' && net === 'cellular') {
    return t('downloadWifiOnlyBlocked') || 'التحميل مسموح عبر الواي فاي فقط';
  }
  if (mode === 'cellular' && net === 'wifi') {
    return t('downloadCellularBlocked') || 'التحميل مسموح عبر باقة النت فقط';
  }
  return '';
}

function assertDownloadNetworkAllowed() {
  const message = getNetworkBlockMessage();
  if (!message) return true;
  showMobileToast(message);
  return false;
}

function syncDownloadNetworkButtons() {
  const mode = getDownloadNetworkMode();
  elements.downloadWifiOnlyBtn?.classList.toggle('active', mode === 'wifi');
  elements.downloadCellularBtn?.classList.toggle('active', mode === 'cellular');
  elements.downloadBothBtn?.classList.toggle('active', mode === 'both');
}

function refreshMobileSettingsUi() {
  if (elements.languageSelect) {
    elements.languageSelect.value = localStorage.getItem('vm_mobile_lang') || 'ar';
  }
  if (elements.defaultQualitySelect) {
    elements.defaultQualitySelect.value = getPreferredDefaultQuality();
  }
  if (elements.speedLimitSelect) {
    elements.speedLimitSelect.value = getSpeedLimit();
  }
  if (elements.autoRetrySelect) {
    elements.autoRetrySelect.value = String(getAutoRetryCount());
  }
  if (elements.turboMode) elements.turboMode.checked = isTurboEnabled();
  if (elements.audioEnhanceToggle) elements.audioEnhanceToggle.checked = isAudioEnhanceEnabled();
  if (elements.autoClipboardToggle) elements.autoClipboardToggle.checked = isClipboardAutoEnabled();
  if (elements.notificationsToggle) elements.notificationsToggle.checked = isNotificationsEnabled();
  if (elements.customDownloadPath) {
    const savedPath = localStorage.getItem('vm_mobile_save_path') || '';
    if (savedPath && savedPath !== 'B:\\' && savedPath !== 'B:') {
      elements.customDownloadPath.value = savedPath;
    }
  }
  syncDownloadNetworkButtons();
  updateScheduleStatus();
}

function getPreferredDefaultQuality() {
  return localStorage.getItem('vm_mobile_quality') || elements.defaultQualitySelect?.value || 'best';
}

function getSpeedLimit() {
  return elements.speedLimitSelect?.value || localStorage.getItem(SETTINGS_KEYS.speedLimit) || 'unlimited';
}

function getAutoRetryCount() {
  const n = Number(elements.autoRetrySelect?.value || localStorage.getItem(SETTINGS_KEYS.retries) || 10);
  return [3, 5, 10].includes(n) ? n : 10;
}

function getMobileEngineOptions() {
  return {
    turbo: isTurboEnabled(),
    audioEnhance: isAudioEnhanceEnabled(),
    speedLimit: getSpeedLimit(),
    retries: getAutoRetryCount()
  };
}

let mobileScheduleTimer = null;
let mobileScheduleTick = null;

function startScheduleTicker() {
  if (mobileScheduleTick) clearInterval(mobileScheduleTick);
  updateScheduleStatus();
  mobileScheduleTick = setInterval(updateScheduleStatus, 15000);
}

function stopScheduleTicker() {
  if (!mobileScheduleTick) return;
  clearInterval(mobileScheduleTick);
  mobileScheduleTick = null;
}

function formatSchedulerMessage(minutes) {
  return String(t('schedulerActivated') || 'تم تفعيل الجدولة: سيبدأ التحميل بعد {minutes} دقيقة')
    .replace('{minutes}', String(minutes));
}

function updateScheduleStatus() {
  const at = Number(localStorage.getItem('vm_mobile_schedule_at') || 0);
  if (!elements.scheduleStatus) return;
  if (!at || at <= Date.now()) {
    elements.scheduleStatus.textContent = '';
    return;
  }
  const minutes = Math.max(1, Math.round((at - Date.now()) / 60000));
  elements.scheduleStatus.textContent = formatSchedulerMessage(minutes);
}

function clearMobileSchedule(showToast = false) {
  if (mobileScheduleTimer) {
    clearTimeout(mobileScheduleTimer);
    mobileScheduleTimer = null;
  }
  stopScheduleTicker();
  localStorage.removeItem('vm_mobile_schedule_at');
  localStorage.removeItem('vm_mobile_schedule_urls');
  updateScheduleStatus();
  if (showToast) showMobileToast(t('schedulerCanceled') || 'تم إلغاء الجدولة');
}

function collectScheduleUrls() {
  try { updateBatchQueueFromText(); } catch { /* ignore */ }
  const fromBatch = (batchQueue || []).map((item) => item.url).filter(Boolean);
  if (fromBatch.length) return fromBatch;
  return [...(settingsBatchQueue || [])].filter(Boolean);
}

async function runScheduledMobileBatch() {
  const urls = (() => {
    try { return JSON.parse(localStorage.getItem('vm_mobile_schedule_urls') || '[]'); } catch { return []; }
  })();
  clearMobileSchedule(false);
  if (Array.isArray(urls) && urls.length) {
    addUrlsToBatch(urls);
    batchQueue.forEach((item) => {
      if (urls.includes(item.url) && item.status !== 'downloading') item.status = 'pending';
    });
  }
  switchMobileTab('downloader');
  notifyMobile(t('schedulerTitle') || 'جدولة التحميل التلقائي', t('notifyDownloadBody') || 'بدء التحميل المجدول');
  await startMobileBatch();
}

function armMobileSchedule(atMs, urls) {
  clearMobileSchedule(false);
  localStorage.setItem('vm_mobile_schedule_at', String(atMs));
  localStorage.setItem('vm_mobile_schedule_urls', JSON.stringify(urls || []));
  const delay = Math.max(0, atMs - Date.now());
  mobileScheduleTimer = setTimeout(() => {
    runScheduledMobileBatch().catch(() => {});
  }, delay);
  startScheduleTicker();
}

function restoreMobileSchedule() {
  const at = Number(localStorage.getItem('vm_mobile_schedule_at') || 0);
  if (!at) return;
  if (at > Date.now()) {
    const urls = (() => {
      try { return JSON.parse(localStorage.getItem('vm_mobile_schedule_urls') || '[]'); } catch { return []; }
    })();
    armMobileSchedule(at, urls);
    return;
  }
  if (Date.now() - at < 60 * 60 * 1000) {
    runScheduledMobileBatch().catch(() => {});
    return;
  }
  clearMobileSchedule(false);
}

function activateMobileSchedule() {
  const urls = collectScheduleUrls();
  if (!urls.length) {
    showMobileToast(t('schedulerNeedUrls') || 'أضف روابط للسلسلة أولاً ثم فعّل الجدولة');
    return;
  }
  let delayMs = 0;
  const timeValue = elements.scheduleTimeInput?.value;
  const delayValue = Number(elements.scheduleDelayInput?.value || 0);
  if (timeValue) {
    const [h, m] = timeValue.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    delayMs = target.getTime() - now.getTime();
  } else if (delayValue > 0) {
    delayMs = delayValue * 60 * 1000;
  }
  if (delayMs <= 0) {
    showMobileToast(t('schedulerNeedTime') || 'الرجاء تحديد وقت بدء أو تحديد الدقائق المتبقية');
    return;
  }
  armMobileSchedule(Date.now() + delayMs, urls);
  const minutes = Math.max(1, Math.round(delayMs / 60000));
  showMobileToast(formatSchedulerMessage(minutes));
  notifyMobile(t('schedulerTitle') || 'جدولة التحميل التلقائي', formatSchedulerMessage(minutes));
}

function isMobileVideoHost(hostname) {
  const host = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  return MOBILE_VIDEO_HOSTS.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
}

function extractMobileVideoUrl(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const match of matches) {
    const cleaned = match.replace(/[.,;!?)\]]+$/g, '');
    try {
      const parsed = new URL(cleaned);
      if (isMobileVideoHost(parsed.hostname)) return parsed.toString();
    } catch { /* next */ }
  }
  return '';
}

let clipboardWatchTimer = null;
let clipboardWatchLast = '';
let clipboardWatchBusy = false;

function stopClipboardWatcher() {
  if (clipboardWatchTimer) {
    clearInterval(clipboardWatchTimer);
    clipboardWatchTimer = null;
  }
}

function isMobileDownloadBusy() {
  return !!elements.progressContainer?.classList.contains('show') || isBatchProcessing;
}

async function pollClipboardForVideoLink() {
  if (clipboardWatchBusy || !isClipboardAutoEnabled()) return;
  if (!document.getElementById('downloaderTab')?.classList.contains('active')) return;
  if (isMobileDownloadBusy()) return;
  clipboardWatchBusy = true;
  try {
    let text = '';
    try {
      const data = await withTimeout(safeFetchJson('/api/clipboard'), 800);
      text = String(data?.text || '');
    } catch { /* try browser clipboard */ }
    if (!text && navigator.clipboard?.readText) {
      try { text = await withTimeout(navigator.clipboard.readText(), 400); } catch { /* blocked */ }
    }
    const url = extractMobileVideoUrl(text);
    if (!url || url === clipboardWatchLast) return;
    const current = String(elements.videoUrl?.value || '').trim();
    if (current && (current === url || extractMobileVideoUrl(current) === url)) {
      clipboardWatchLast = url;
      return;
    }
    clipboardWatchLast = url;
    if (elements.videoUrl) elements.videoUrl.value = url;
    showMobileToast(t('clipboardDetected') || 'تم اكتشاف رابط فيديو في الحافظة');
    notifyMobile(t('clipboardDetected') || 'تم اكتشاف رابط فيديو في الحافظة', url);
    try { fetchVideoInfo(); } catch { /* ignore */ }
  } catch {
    /* ignore clipboard errors */
  } finally {
    clipboardWatchBusy = false;
  }
}

function startClipboardWatcher() {
  stopClipboardWatcher();
  if (!isClipboardAutoEnabled()) return;
  pollClipboardForVideoLink();
  clipboardWatchTimer = setInterval(pollClipboardForVideoLink, 1500);
}

async function ensureNotificationPermission() {
  if (!isNotificationsEnabled() || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function notifyMobile(title, body) {
  if (!isNotificationsEnabled()) return;
  const show = () => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(title, { body, icon: 'assets/vm-icon.png' });
    } catch { /* ignore */ }
  };
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then((perm) => { if (perm === 'granted') show(); }).catch(() => {});
    return;
  }
  show();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function readClipboardText() {
  try {
    const data = await withTimeout(safeFetchJson('/api/clipboard'), 900);
    if (data?.text && String(data.text).trim()) return String(data.text);
  } catch {
    // local clipboard API unavailable
  }
  try {
    if (navigator.clipboard?.readText) {
      const text = await withTimeout(navigator.clipboard.readText(), 400);
      if (text && text.trim()) return text;
    }
  } catch {
    // browser blocked clipboard permission
  }
  try {
    const helper = document.createElement('textarea');
    helper.setAttribute('readonly', '');
    helper.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:0;top:0;';
    document.body.appendChild(helper);
    helper.focus();
    const ok = document.execCommand('paste');
    const text = helper.value;
    helper.remove();
    if (ok && text && text.trim()) return text;
  } catch {
    // ignore
  }
  return '';
}

function askUserToPaste(hint = 'الصق النص هنا ثم اضغط تأكيد') {
  return new Promise((resolve) => {
    const modal = document.getElementById('pasteModal');
    const input = document.getElementById('pasteModalText');
    const hintEl = document.getElementById('pasteModalHint');
    const confirmBtn = document.getElementById('pasteModalConfirm');
    const cancelBtn = document.getElementById('pasteModalCancel');
    if (!modal || !input || !confirmBtn || !cancelBtn) {
      resolve(window.prompt(hint) || '');
      return;
    }

    if (hintEl) hintEl.textContent = hint;
    input.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);

    const finish = (value) => {
      modal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(value || '');
    };
    const onConfirm = () => finish(input.value);
    const onCancel = () => finish('');
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    input.addEventListener('paste', () => {
      setTimeout(() => {
        if (input.value.trim()) onConfirm();
      }, 0);
    }, { once: true });
  });
}

async function getPastedText(hint) {
  const fromClipboard = await readClipboardText();
  if (fromClipboard.trim()) return fromClipboard;
  return askUserToPaste(hint);
}

// 1. Robust Clipboard Paste & Search Action
async function handlePasteAndSearch() {
  const text = await getPastedText('الصق رابط الفيديو ثم اضغط تأكيد');
  const cleanUrl = text.trim().match(/https?:\/\/[^\s]+/i)?.[0] || '';
  if (!cleanUrl) return;
  elements.videoUrl.value = cleanUrl;
  fetchVideoInfo();
}

elements.pasteBtn?.addEventListener('click', handlePasteAndSearch);

// Folder Location & Open Folder Action
const handleFolderAction = async () => {
  try {
    const data = await safeFetchJson('/api/status');
    const dir = data.downloadsDir || '';
    if (dir && elements.customDownloadPath) {
      elements.customDownloadPath.value = dir;
      localStorage.setItem('vm_mobile_save_path', dir);
    }
    alert(dir ? `مجلد التحميل:\n${dir}` : 'مجلد التنزيلات المباشرة بالجهاز');
  } catch (e) {
    alert('مكان التحميل: مجلد التنزيلات المباشرة بالجهاز');
  }
};

async function openLastDownloadFolder() {
  const lastPath = localStorage.getItem('vm_mobile_last_path')
    || elements.customDownloadPath?.value
    || localStorage.getItem('vm_mobile_save_path')
    || '';
  try {
    const data = await safeFetchJson('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: lastPath })
    });
    if (!data?.success) throw new Error(data?.error || 'تعذر فتح المجلد');
    showMobileToast(data.path || (t('open') || 'تم فتح المجلد'));
  } catch (err) {
    showMobileToast(err.message || 'تعذر فتح مجلد التحميلات');
  }
}

async function pickDownloadFolder() {
  try {
    const data = await safeFetchJson('/api/pick-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: elements.customDownloadPath?.value || '' })
    });
    if (data?.canceled) return;
    if (!data?.success || !data.path) {
      throw new Error(data?.error || 'تعذر اختيار المجلد');
    }
    elements.customDownloadPath.value = data.path;
    localStorage.setItem('vm_mobile_save_path', data.path);
    showMobileToast(data.path);
  } catch (err) {
    showMobileToast(err.message || 'تعذر اختيار مجلد التحميل');
  }
}

elements.chooseFolderBtn?.addEventListener('click', pickDownloadFolder);
elements.openFolderBtn?.addEventListener('click', openLastDownloadFolder);
elements.openLastVideoFolderBtn?.addEventListener('click', openLastDownloadFolder);

elements.clearBtn?.addEventListener('click', () => {
  elements.videoUrl.value = '';
  currentVideoInfo = null;
  elements.videoCard?.classList.remove('show');
  elements.studioPanel?.classList.remove('show');
  elements.downloadOptions?.classList.remove('show');
  elements.videoPreviewCard?.classList.add('hidden');
  document.getElementById('emptyHint')?.classList.remove('hidden');
});

// Safe JSON Helper to prevent Unexpected token '<' errors on static hosts
async function safeFetchJson(apiUrl, options = {}) {
  const res = await fetch(apiUrl, {
    cache: 'no-store',
    ...options,
    headers: {
      'Accept': 'application/json',
      ...(options.headers || {})
    }
  });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    return JSON.parse(text);
  }
  throw new Error(res.ok ? 'تعذر قراءة رد الخادم' : `تعذر الاتصال بالخادم (${res.status})`);
}

// 2. Fetch Video Info
async function fetchVideoInfo() {
  const url = elements.videoUrl.value.trim();
  if (!url) {
    alert('الرجاء إدخال أو لصق رابط الفيديو أولاً');
    return;
  }

  elements.loadingState.classList.add('show');
  elements.videoCard?.classList.remove('show');
  elements.studioPanel?.classList.remove('show');
  elements.downloadOptions?.classList.remove('show');

  let data = null;

  try {
    data = await safeFetchJson('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (data?.data && typeof data.data === 'object') {
      data = { ...data, ...data.data };
    }
    if (!data.url) data.url = url;
    if (data.success === false) {
      throw new Error(data.error || 'تعذر جلب معلومات الفيديو');
    }
  } catch (apiErr) {
    // Client-Side oEmbed Fallback for YouTube, TikTok, Vimeo, etc. when running on static hosts
    try {
      const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      const oembedData = await oembedRes.json();
      data = {
        url: url,
        title: oembedData.title || 'فيديو متاح للتحميل والإنتاج',
        uploader: oembedData.author_name || 'VIPD Engine',
        thumbnail: oembedData.thumbnail_url || 'assets/icon.png',
        duration: 180,
        availableHeights: [1080, 720, 480, 360]
      };
    } catch (fallbackErr) {
      data = {
        url: url,
        title: 'فيديو متاح للتحميل والإنتاج',
        uploader: 'VIPD Engine',
        thumbnail: 'assets/icon.png',
        duration: 120,
        availableHeights: [1080, 720, 480]
      };
    }
  }

  currentVideoInfo = data;
  elements.loadingState.classList.remove('show');
  displayVideoInfo(data);
}

elements.fetchBtn?.addEventListener('click', fetchVideoInfo);
elements.videoUrl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

function initMobileClipRange(duration) {
  const total = Math.max(1, Number(duration) || 120);
  if (elements.clipStartRange) {
    elements.clipStartRange.min = 0;
    elements.clipStartRange.max = total;
    elements.clipStartRange.step = '0.1';
    elements.clipStartRange.value = 0;
  }
  if (elements.clipEndRange) {
    elements.clipEndRange.min = 0;
    elements.clipEndRange.max = total;
    elements.clipEndRange.step = '0.1';
    elements.clipEndRange.value = Math.min(30, total);
  }
  if (elements.clipVideoDurationLabel) {
    elements.clipVideoDurationLabel.textContent = formatDuration(total);
  }
  if (elements.frameSeekRange) {
    elements.frameSeekRange.min = 0;
    elements.frameSeekRange.max = total;
    elements.frameSeekRange.step = '0.1';
    if (Number(elements.frameSeekRange.value) > total) elements.frameSeekRange.value = Math.min(5, total);
    if (elements.frameSeekLabel) {
      elements.frameSeekLabel.textContent = formatDuration(Number(elements.frameSeekRange.value || 0));
    }
  }
  updateClipRangeDisplay();
}

function displayVideoInfo(info) {
  if (elements.videoTitle) elements.videoTitle.textContent = info.title || 'فيديو بدون عنوان';
  if (elements.uploaderName) elements.uploaderName.textContent = info.uploader || 'VIPD Engine';
  if (elements.durationBadge) elements.durationBadge.textContent = info.duration ? formatDuration(info.duration) : '00:00';
  if (elements.thumbnailImg) {
    const covers = youtubeCoverCandidates(info);
    if (covers.length) bindCoverImageFallbacks(elements.thumbnailImg, covers);
    else elements.thumbnailImg.src = info.thumbnail || 'assets/icon.png';
  }
  if (elements.filenameInput) {
    const safeTitle = (info.title || 'video')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60);
    elements.filenameInput.value = safeTitle || 'vm-video';
  }

  document.getElementById('emptyHint')?.classList.add('hidden');
  elements.videoCard?.classList.add('show');
  elements.studioPanel?.classList.add('show');
  elements.downloadOptions?.classList.add('show');
  elements.videoPreviewCard?.classList.remove('hidden');

  initMobileClipRange(info.duration);
  resetClipPreviewState();
  updateGlobalSettingsBadge();
  renderQualityGrid();
  updateImageModeUi();
  refreshLivePreview();
}

function getAspectCssValue() {
  if (maskShape === 'circle' || imageAspect === '1:1') return '1 / 1';
  if (imageAspect === '16:9') return '16 / 9';
  if (imageAspect === '9:16') return '9 / 16';
  if (imageAspect === '4:5') return '4 / 5';
  if (imageAspect === '21:9') return '21 / 9';
  return '';
}

function updateAspectBadge() {
  if (!elements.aspectBadge) return;
  const aspectLabels = {
    default: t('aspectFree') || 'حر',
    '16:9': '16:9',
    '1:1': '1:1',
    '9:16': '9:16',
    '4:5': '4:5',
    '21:9': '21:9'
  };
  const sizeLabels = {
    original: t('sizeOriginal') || 'حجم أصلي',
    '480': '480px',
    '720': '720px',
    '1080': '1080px',
    custom: t('aspectCustomShort') || 'مخصص'
  };
  const a = aspectLabels[imageAspect] || imageAspect;
  const s = imageOutputSize === 'custom'
    ? `${elements.customAspectWidth?.value || 1080}×${elements.customAspectHeight?.value || 1080}`
    : (sizeLabels[imageOutputSize] || imageOutputSize);
  const shape = maskShape === 'circle' ? ' · ○' : (maskShape === 'rounded' ? ' · ⌒' : '');
  elements.aspectBadge.textContent = `📐 ${a} · ${s}${shape}`;
  elements.customAspectInputs?.classList.toggle('hidden', imageOutputSize !== 'custom');
}

function applyBoxPreviewStyle(box, img, fallbackHeight) {
  if (!box) return;
  const aspectCss = getAspectCssValue();
  const isPortrait = maskShape === 'circle' || imageAspect === '9:16' || imageAspect === '4:5' || imageAspect === '1:1';
  let radius = '12px';
  if (maskShape === 'circle') radius = '50%';
  else if (maskShape === 'rounded') radius = '22px';
  else if (maskShape === 'rect') radius = '12px';

  box.style.borderRadius = radius;
  box.style.overflow = 'hidden';
  box.style.marginInline = isPortrait ? 'auto' : '0';
  if (aspectCss) {
    box.style.aspectRatio = aspectCss;
    box.style.width = isPortrait ? 'min(100%, 240px)' : '100%';
    box.style.height = 'auto';
    box.style.maxHeight = isPortrait ? '360px' : (fallbackHeight || '240px');
  } else {
    box.style.aspectRatio = '';
    box.style.width = '100%';
    box.style.height = fallbackHeight || '220px';
    box.style.maxHeight = '';
  }
  if (img) {
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = aspectCss ? 'cover' : 'contain';
    img.style.borderRadius = radius;
  }
}

function resetLivePreviewLayout() {
  const embed = elements.videoEmbedContainer;
  embed?.classList.remove('image-preview');
  if (studioMode !== 'clip') document.getElementById('clipSeekOverlay')?.remove();
  if (embed) {
    embed.style.display = '';
    embed.style.justifyContent = '';
    embed.style.alignItems = '';
  }
  const cover = embed?.querySelector('.live-preview-cover');
  if (cover) {
    cover.style.aspectRatio = '';
    cover.style.width = '';
    cover.style.height = '';
    cover.style.maxHeight = '';
    cover.style.marginInline = '';
    cover.style.borderRadius = '';
  }
  const coverImg = document.getElementById('livePreviewCoverImg');
  if (coverImg) {
    coverImg.style.objectFit = '';
    coverImg.style.borderRadius = '';
  }
  if (elements.thumbPreviewBox) {
    elements.thumbPreviewBox.style.aspectRatio = '';
    elements.thumbPreviewBox.style.width = '';
    elements.thumbPreviewBox.style.height = '';
    elements.thumbPreviewBox.style.maxHeight = '';
    elements.thumbPreviewBox.style.marginInline = '';
    elements.thumbPreviewBox.style.borderRadius = '';
  }
}

function applyLiveImagePreview() {
  updateAspectBadge();
  updateGlobalSettingsBadge();
  if (studioMode !== 'image') {
    resetLivePreviewLayout();
    return;
  }
  const embed = elements.videoEmbedContainer;
  embed?.classList.add('image-preview');
  applyBoxPreviewStyle(embed?.querySelector('.live-preview-cover'), document.getElementById('livePreviewCoverImg'), '220px');
  applyBoxPreviewStyle(elements.thumbPreviewBox, elements.thumbPreviewImg, '140px');
  const iframe = embed?.querySelector('iframe');
  if (iframe) {
    const aspectCss = getAspectCssValue();
    const isPortrait = maskShape === 'circle' || imageAspect === '9:16' || imageAspect === '4:5' || imageAspect === '1:1';
    iframe.style.width = isPortrait ? 'min(100%, 240px)' : '100%';
    iframe.style.height = aspectCss && isPortrait ? '320px' : '220px';
    iframe.style.borderRadius = maskShape === 'circle' ? '50%' : (maskShape === 'rounded' ? '22px' : '12px');
    iframe.style.marginInline = isPortrait ? 'auto' : '0';
    iframe.style.display = 'block';
  }
}

function updateGlobalSettingsBadge() {
  if (!elements.globalSettingsBadge) return;
  if (studioMode === 'image') {
    const fmt = String(imageFormat || 'png').toUpperCase();
    const aspect = imageAspect === 'default' ? (t('aspectFree') || 'حر') : imageAspect;
    const size = imageOutputSize === 'custom'
      ? `${elements.customAspectWidth?.value || 1080}×${elements.customAspectHeight?.value || 1080}`
      : (imageOutputSize === 'original' ? (t('sizeOriginalShort') || 'أصلي') : `${imageOutputSize}px`);
    const shape = maskShape === 'circle' ? '○' : (maskShape === 'rounded' ? '⌒' : '▭');
    if (imageMode === 'frame') {
      elements.globalSettingsBadge.textContent = `FRAME · ${formatDuration(Number(elements.frameSeekRange?.value || 0))} · ${aspect} · ${size} · ${shape} · ${fmt}`;
    } else {
      elements.globalSettingsBadge.textContent = `COVER · ${aspect} · ${size} · ${shape} · ${fmt}`;
    }
    return;
  }
  if (studioMode === 'clip') {
    const start = formatDuration(Number(elements.clipStartRange?.value || 0));
    const end = formatDuration(Number(elements.clipEndRange?.value || 0));
    const kind = getClipExportType();
    const kindLabel = kind === 'audio'
      ? (selectedAudioAbr === 'best' ? 'MP3 MAX' : `${selectedAudioAbr}k`)
      : (selectedHeight === 'best' ? 'MAX' : `${selectedHeight}p`);
    const modeLabel = kind === 'audio'
      ? (t('typeClipAudioOnly') || 'صوت')
      : (kind === 'video-only' ? (t('typeClipNoAudio') || 'بدون صوت') : (t('typeClipAudio') || 'مع صوت'));
    elements.globalSettingsBadge.textContent = `CLIP · ${start}→${end} · ${kindLabel} · ${modeLabel}`;
    return;
  }
  if (downloadType === 'audio') {
    const abrLabel = selectedAudioAbr === 'best' ? 'MP3 MAX' : `${selectedAudioAbr}k`;
    elements.globalSettingsBadge.textContent = `${abrLabel} · صوت فقط`;
    return;
  }
  if (downloadType === 'video-only') {
    const hLabel = selectedHeight === 'best' ? 'MAX' : `${selectedHeight}p`;
    elements.globalSettingsBadge.textContent = `${hLabel} · بدون صوت`;
    return;
  }
  const hLabel = selectedHeight === 'best' ? 'MAX' : `${selectedHeight}p`;
  elements.globalSettingsBadge.textContent = `${hLabel} · مع صوت`;
}

function youtubeIdFromUrl(url) {
  const match = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match?.[1] || '';
}

function youtubeIdFromThumb(thumb) {
  const match = String(thumb || '').match(/ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//i);
  return match?.[1] || '';
}

function normalizeYoutubeThumbUrl(raw) {
  let cover = String(raw || '').trim();
  if (!cover) return '';
  cover = cover
    .replace(/i\.ytimg\.com\/vi_webp\//i, 'i.ytimg.com/vi/')
    .replace(/\/(?:maxresdefault|sddefault|hqdefault|mqdefault|default)\.webp(?:\?.*)?$/i, (m) => {
      const name = m.replace(/\.webp(?:\?.*)?$/i, '').split('/').pop();
      return `/${name}.jpg`;
    });
  return cover;
}

function youtubeCoverCandidates(info) {
  const urls = [];
  const id = youtubeIdFromUrl(info?.url) || youtubeIdFromUrl(info?.webpage_url) || youtubeIdFromThumb(info?.thumbnail);
  const original = normalizeYoutubeThumbUrl(info?.thumbnail);
  if (/^https?:\/\//i.test(original) && !/assets\//i.test(original)) urls.push(original);
  if (id) {
    ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', '0'].forEach((name) => {
      urls.push(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    });
  }
  return [...new Set(urls)];
}

function bindCoverImageFallbacks(img, candidates) {
  if (!img || !candidates.length) return;
  let index = 0;
  const loadNext = () => {
    if (index >= candidates.length) return;
    img.src = candidates[index++];
  };
  img.onload = () => {
    if (img.naturalWidth > 0 && img.naturalWidth <= 160 && index < candidates.length) {
      loadNext();
    }
  };
  img.onerror = loadNext;
  loadNext();
}

function renderCoverPreview(candidates, caption) {
  if (!elements.videoEmbedContainer) return;
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);
  const safeCaption = escapeHtml(caption || '');
  elements.videoEmbedContainer.innerHTML = `
    <div class="live-preview-cover">
      <img id="livePreviewCoverImg" alt="">
      ${safeCaption ? `<span class="live-preview-caption">${safeCaption}</span>` : ''}
    </div>`;
  bindCoverImageFallbacks(document.getElementById('livePreviewCoverImg'), list);
  applyLiveImagePreview();
}

let previewRefreshTimer = null;

function scheduleLivePreview(delay = 0) {
  updateGlobalSettingsBadge();
  if (delay <= 0) {
    refreshLivePreview();
    return;
  }
  clearTimeout(previewRefreshTimer);
  previewRefreshTimer = setTimeout(() => refreshLivePreview(), delay);
}

function showImageFramePreview(seconds, immediate = false) {
  imageMode = 'frame';
  paintSeekPreview(seconds, t('frame') || 'لقطة من الفيديو', immediate);
}

function refreshLivePreview() {
  if (!elements.videoEmbedContainer || !currentVideoInfo) return;
  updateGlobalSettingsBadge();
  const info = currentVideoInfo;
  const covers = youtubeCoverCandidates(info);
  const videoId = youtubeIdFromUrl(info.url);

  if (studioMode === 'image' && imageMode !== 'frame') {
    if (covers.length) {
      renderCoverPreview(covers, t('thumbnail') || 'الصورة المصغرة');
    } else {
      applyLiveImagePreview();
    }
    return;
  }

  if (studioMode === 'image' && imageMode === 'frame') {
    showImageFramePreview(Number(elements.frameSeekRange?.value || 0), true);
    return;
  }

  resetLivePreviewLayout();

  if (studioMode === 'clip') {
    const start = Number(elements.clipStartRange?.value || 0);
    const end = Number(elements.clipEndRange?.value || 0);
    const seekAt = clipSeekWhich === 'end' ? end : start;
    seekClipPreview(seekAt, clipSeekWhich, true);
    return;
  }

  if (videoId) {
    elements.videoEmbedContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%; height:220px; border:none; border-radius:10px;"></iframe>`;
    return;
  }
  if (covers.length) renderCoverPreview(covers, '');
}

function setupVideoPreviewPlayer() {
  refreshLivePreview();
}

elements.refreshPreviewBtn?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  refreshLivePreview();
  showMobileToast(t('thumbnail') && studioMode === 'image' && imageMode !== 'frame'
    ? (t('thumbnailDesc') || 'تحميل غلاف الفيديو الأصلي')
    : 'تم تحديث المعاينة');
});

function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getMobileQualityLabel(h) {
  if (h === 'best') return { title: 'أقصى جودة', sub: 'بدون سقف — حتى 8K' };
  const n = Number(h);
  if (n >= 4320) return { title: `${n}p · 8K`, sub: 'جودة قصوى' };
  if (n >= 2160) return { title: `${n}p · 4K UHD`, sub: 'جودة فائقة' };
  if (n >= 1440) return { title: `${n}p · 2K QHD`, sub: 'جودة فائقة' };
  if (n >= 1080) return { title: `${n}p · Full HD`, sub: 'جودة عالية' };
  if (n >= 720) return { title: `${n}p · HD`, sub: 'جودة عالية' };
  if (n >= 480) return { title: `${n}p`, sub: 'جودة متوسطة' };
  if (n >= 360) return { title: `${n}p`, sub: 'جودة متوسطة' };
  return { title: `${n}p`, sub: 'جودة منخفضة' };
}

function getMobileAudioQualityLabel(abr) {
  if (abr === 'best') return { title: t('audioQualityBest') || 'أقصى جودة صوت', sub: 'MP3 بدون سقف' };
  const n = Number(abr);
  if (n >= 320) return { title: `${n} kbps`, sub: t('audioQuality320') || 'أقصى MP3' };
  if (n >= 256) return { title: `${n} kbps`, sub: 'فائقة' };
  if (n >= 192) return { title: `${n} kbps`, sub: 'عالية' };
  if (n >= 160) return { title: `${n} kbps`, sub: 'متوسطة مرتفعة' };
  if (n >= 128) return { title: `${n} kbps`, sub: 'متوسطة' };
  if (n >= 96) return { title: `${n} kbps`, sub: 'منخفضة' };
  return { title: `${n} kbps`, sub: 'منخفضة جداً' };
}

function renderQualityGrid() {
  if (!elements.unifiedQualityGrid) return;
  if (getActiveExportType() === 'audio') {
    const options = ['best', 320, 256, 192, 160, 128, 96, 64];
    if (!options.some((v) => String(v) === String(selectedAudioAbr))) selectedAudioAbr = 'best';
    elements.unifiedQualityGrid.innerHTML = options.map((abr) => {
      const { title, sub } = getMobileAudioQualityLabel(abr);
      const active = String(abr) === String(selectedAudioAbr) ? 'active' : '';
      return `
      <div class="quality-card ${active}" data-abr="${abr}">
        <strong>${title}</strong>
        <span style="font-size:11px; display:block; opacity:0.8;">${sub}</span>
      </div>`;
    }).join('');
    elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        selectedAudioAbr = btn.dataset.abr || 'best';
        updateGlobalSettingsBadge();
      });
    });
    return;
  }

  const options = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320, 'best'];
  const preferred = String(getPreferredDefaultQuality());
  selectedHeight = options.some((h) => String(h) === preferred) ? preferred : 'best';
  elements.unifiedQualityGrid.innerHTML = options.map((h) => {
    const { title, sub } = getMobileQualityLabel(h);
    const active = String(h) === String(selectedHeight) ? 'active' : '';
    return `
    <div class="quality-card ${active}" data-height="${h}">
      <strong>${title}</strong>
      <span style="font-size:11px; display:block; opacity:0.8;">${sub}</span>
    </div>`;
  }).join('');

  elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      selectedHeight = btn.dataset.height;
      updateGlobalSettingsBadge();
      refreshLivePreview();
    });
  });
}

// 3. Download Action
elements.downloadBtn?.addEventListener('click', async () => {
  if (!currentVideoInfo?.url && !elements.videoUrl?.value?.trim()) {
    showMobileToast(t('errSearchFirst') || 'الرجاء البحث عن فيديو أولاً');
    return;
  }
  if (!currentVideoInfo) {
    showMobileToast(t('errSearchFirst') || 'الرجاء البحث عن فيديو أولاً');
    return;
  }
  if (!assertDownloadNetworkAllowed()) return;

  if (elements.downloadBtn) elements.downloadBtn.disabled = true;
  elements.downloadOptions.classList.remove('show');
  elements.progressContainer.classList.add('show');
  elements.successMessage?.classList.remove('show');

  let prog = 8;
  elements.progressPercent.textContent = '8%';
  elements.progressFill.style.width = '8%';
  elements.progressInfo.textContent = 'جاري التحميل... لا تغلق الصفحة';

  const timer = setInterval(() => {
    if (prog < 88) {
      prog += 2;
      elements.progressPercent.textContent = `${prog}%`;
      elements.progressFill.style.width = `${prog}%`;
    }
  }, 1200);

  try {
    const exportType = getActiveExportType();
    const payload = {
      url: currentVideoInfo.url || elements.videoUrl?.value?.trim(),
      height: selectedHeight || 'best',
      type: exportType,
      abr: exportType === 'audio' ? selectedAudioAbr : undefined,
      filename: elements.filenameInput.value,
      studioMode,
      mode: studioMode,
      outputDir: elements.customDownloadPath?.value || localStorage.getItem('vm_mobile_save_path') || '',
      ...getMobileEngineOptions()
    };

    if (studioMode === 'clip') {
      payload.clipStart = Number(elements.clipStartRange?.value || 0);
      payload.clipEnd = Number(elements.clipEndRange?.value || 30);
      payload.clipAudioMode = exportType;
      if (!(payload.clipEnd > payload.clipStart)) {
        throw new Error('نطاق القص غير صالح. حرّك بداية ونهاية المقطع');
      }
      const rangeText = `${formatDuration(payload.clipStart)} → ${formatDuration(payload.clipEnd)}`;
      elements.progressInfo.textContent = exportType === 'audio'
        ? `جاري تصدير صوت المقطع ${rangeText}...`
        : exportType === 'video-only'
          ? `جاري تصدير مقطع بدون صوت ${rangeText}...`
          : `جاري تصدير مقطع مع صوت ${rangeText}...`;
    } else if (studioMode === 'image') {
      payload.imageMode = imageMode || 'thumbnail';
      payload.imageFormat = imageFormat || 'png';
      const thumb = String(currentVideoInfo.thumbnail || '').trim();
      if (/^https?:\/\//i.test(thumb) && !/assets\/(icon|vm-icon)/i.test(thumb)) {
        payload.thumbnailUrl = thumb;
      }
      payload.aspectRatio = imageAspect || 'default';
      payload.outputSize = imageOutputSize || 'original';
      payload.maskShape = maskShape || 'rect';
      payload.customWidth = Number(elements.customAspectWidth?.value || 1080);
      payload.customHeight = Number(elements.customAspectHeight?.value || 1080);
      if (imageMode === 'frame') {
        payload.frameSeekTime = Number(elements.frameSeekRange?.value || 5);
      }
      elements.progressInfo.textContent = imageMode === 'frame'
        ? (t('progressFrame') || 'جاري استخراج اللقطة...')
        : (t('progressThumbnail') || 'جاري تحميل الصورة المصغرة...');
    } else if (studioMode === 'full' && downloadType === 'audio') {
      elements.progressInfo.textContent = t('progressAudio') || 'جاري تحميل الصوت فقط...';
    } else if (studioMode === 'full' && downloadType === 'video-only') {
      elements.progressInfo.textContent = t('progressVideoOnly') || 'جاري تحميل فيديو بدون صوت...';
    } else if (studioMode === 'full') {
      elements.progressInfo.textContent = t('progressVideoAudio') || 'جاري تحميل فيديو مع صوت...';
    } else if (studioMode === 'aidub') {
      payload.aiDub = true;
      payload.dubLanguage = elements.dubTargetLangSelect?.value || 'ar';
      payload.dubVoice = elements.dubVoiceProfileSelect?.value || 'auto';
      payload.dubMode = elements.dubModeSelect?.value || 'dub_only';
    }

    const data = await safeFetchJson('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    clearInterval(timer);

    if (!data?.success) throw new Error(data?.error || 'تعذر التحميل');

    notifyMobile(
      t('notifyDownloadTitle') || 'اكتمل التحميل',
      currentVideoInfo?.title || t('notifyDownloadBody') || 'تم حفظ الملف بنجاح'
    );

    const fileUrl = data.downloadUrl || data.path;
    let lastDownloadedPath = data.path || data.filename;
    localStorage.setItem('vm_mobile_last_path', lastDownloadedPath);
    elements.progressPercent.textContent = '100%';
    elements.progressFill.style.width = '100%';
    elements.progressContainer.classList.remove('show');
    elements.successMessage.classList.add('show');
    elements.successPath.textContent = lastDownloadedPath;
    elements.quickPlayBtn?.classList.remove('hidden');

    if (fileUrl) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = data.filename
        || (studioMode === 'image' ? `image.${imageFormat || 'png'}` : (exportType === 'audio' ? 'clip.mp3' : 'clip.mp4'));
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    showMobileToast(t('notifyDownloadTitle') || 'اكتمل التحميل');

    const handlePlayAction = () => {
      if (fileUrl) {
        window.open(fileUrl, '_blank');
      } else {
        alert(`تشغيل الملف: ${lastDownloadedPath}`);
      }
    };

    elements.quickPlayBtn?.addEventListener('click', handlePlayAction);
    elements.playLastVideoBtn?.addEventListener('click', handlePlayAction);

    addToMobileHistory({
      title: currentVideoInfo.title,
      thumbnail: currentVideoInfo.thumbnail,
      url: currentVideoInfo.url || payload.url,
      type: studioMode === 'clip'
        ? (exportType === 'audio' ? 'clip-audio' : (exportType === 'video-only' ? 'clip-silent' : 'clip'))
        : (studioMode === 'image' ? 'image' : downloadType),
      path: lastDownloadedPath,
      filename: data.filename || '',
      downloadUrl: data.downloadUrl || ''
    });
  } catch (err) {
    clearInterval(timer);
    elements.progressContainer.classList.remove('show');
    elements.downloadOptions?.classList.add('show');
    showMobileToast(err.message || t('errDownloadFailed') || 'تعذر التحميل');
    alert(err.message || t('errDownloadFailed') || 'تعذر التحميل');
  } finally {
    if (elements.downloadBtn) elements.downloadBtn.disabled = false;
  }
});

elements.newDownloadBtn?.addEventListener('click', () => {
  elements.successMessage.classList.remove('show');
  elements.videoUrl.value = '';
});

// 4. BATCH QUEUE FEATURE (سلسلة روابط)
let batchAutoPasteEnabled = false;
let batchAutoPasteLastRaw = '';
let batchAutoPasteTimer = null;
let batchStopRequested = false;

function getMobileOutputDir() {
  return String(elements.customDownloadPath?.value || localStorage.getItem('vm_mobile_save_path') || '').trim();
}

function triggerMobileFileDownload(data) {
  const fileUrl = data?.downloadUrl || data?.path;
  if (!fileUrl) return;
  const a = document.createElement('a');
  a.href = fileUrl;
  a.download = data.filename || (String(data.filename || data.path || '').toLowerCase().endsWith('.mp3') ? 'audio.mp3' : 'video.mp4');
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function extractUrlsFromText(text) {
  return [...new Set(String(text || '').match(/https?:\/\/[^\s<>"'\)\]]+/gi) || [])];
}

function openBatchPanel() {
  elements.batchQueuePanel?.classList.remove('hidden');
  elements.batchToggleBtn?.classList.add('active');
  elements.batchQueuePanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeBatchPanel() {
  elements.batchQueuePanel?.classList.add('hidden');
  elements.batchToggleBtn?.classList.remove('active');
}

function updateStartBatchDisabled() {
  if (!elements.startBatchBtn || isBatchProcessing) return;
  const hasWork = batchQueue.some((q) => q.status === 'pending' || q.status === 'error');
  elements.startBatchBtn.disabled = !hasWork;
}

function setBatchStartButton(running) {
  if (!elements.startBatchBtn) return;
  if (running) {
    elements.startBatchBtn.disabled = false;
    elements.startBatchBtn.title = 'إيقاف';
    elements.startBatchBtn.innerHTML = '<i class="fas fa-stop"></i>';
    elements.startBatchBtn.classList.add('active');
  } else {
    elements.startBatchBtn.title = 'بدء';
    elements.startBatchBtn.innerHTML = '<i class="fas fa-play"></i>';
    elements.startBatchBtn.classList.remove('active');
    updateStartBatchDisabled();
  }
}

function syncBatchTextarea() {
  if (elements.batchUrlsText) {
    elements.batchUrlsText.value = batchQueue.map((q) => q.url).join('\n');
  }
  updateStartBatchDisabled();
}

function addUrlsToBatch(urls) {
  if (!urls.length) return 0;
  const existing = new Set(batchQueue.map((q) => q.url));
  let added = 0;
  urls.forEach((url) => {
    if (!existing.has(url)) {
      existing.add(url);
      batchQueue.push({
        id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url,
        status: 'pending',
        quality: downloadType === 'audio' ? (selectedAudioAbr || 'best') : (selectedHeight || 'best'),
        type: downloadType || 'video-audio',
        filename: '',
        showEditor: false
      });
      added += 1;
    }
  });
  if (added) {
    openBatchPanel();
    syncBatchTextarea();
    renderBatchQueueList();
  }
  return added;
}

function updateBatchQueueFromText() {
  const lines = String(elements.batchUrlsText?.value || '')
    .split(/\s+/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));
  const uniqueUrls = [...new Set(lines)];
  batchQueue = uniqueUrls.map((url) => {
    const existing = batchQueue.find((item) => item.url === url);
    if (existing) return existing;
    return {
      id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url,
      status: 'pending',
      quality: selectedHeight || 'best',
      type: downloadType || 'video-audio',
      filename: '',
      showEditor: false
    };
  });
  renderBatchQueueList();
  updateStartBatchDisabled();
}

async function pollBatchAutoPaste() {
  if (!batchAutoPasteEnabled) return;
  const text = (await readClipboardText()).trim();
  if (!text || text === batchAutoPasteLastRaw) return;
  batchAutoPasteLastRaw = text;
  const added = addUrlsToBatch(extractUrlsFromText(text));
  if (added) showMobileToast(`تمت إضافة ${added} رابط`);
}

function stopBatchAutoPaste() {
  batchAutoPasteEnabled = false;
  if (batchAutoPasteTimer) {
    clearInterval(batchAutoPasteTimer);
    batchAutoPasteTimer = null;
  }
  elements.batchAutoPasteBtn?.classList.remove('active');
  if (elements.batchAutoPasteBtn) {
    elements.batchAutoPasteBtn.title = 'لصق تلقائي';
    elements.batchAutoPasteBtn.innerHTML = '<i class="fas fa-clipboard"></i>';
  }
}

async function toggleBatchAutoPaste() {
  if (batchAutoPasteEnabled) {
    stopBatchAutoPaste();
    showMobileToast('تم إيقاف اللصق التلقائي');
    return;
  }
  batchAutoPasteEnabled = true;
  elements.batchAutoPasteBtn?.classList.add('active');
  if (elements.batchAutoPasteBtn) {
    elements.batchAutoPasteBtn.title = 'لصق تلقائي قيد التشغيل';
    elements.batchAutoPasteBtn.innerHTML = '<i class="fas fa-clipboard-check"></i>';
  }
  openBatchPanel();
  const current = (await readClipboardText()).trim();
  batchAutoPasteLastRaw = current;
  addUrlsToBatch(extractUrlsFromText(current));
  batchAutoPasteTimer = setInterval(pollBatchAutoPaste, 900);
  showMobileToast('لصق تلقائي يعمل');
}

window.toggleBatchQueueItemEditor = function (id, event) {
  if (event) event.stopPropagation();
  const item = batchQueue.find((q) => q.id === id || q.url === id);
  if (!item || item.status === 'downloading') return;
  item.showEditor = !item.showEditor;
  renderBatchQueueList();
};

window.removeBatchItem = function (id, event) {
  if (event) event.stopPropagation();
  const item = batchQueue.find((q) => q.id === id || q.url === id);
  if (item?.status === 'downloading') {
    showMobileToast('لا يمكن حذف فيديو قيد التحميل');
    return;
  }
  batchQueue = batchQueue.filter((q) => q.id !== id && q.url !== id);
  syncBatchTextarea();
  renderBatchQueueList();
};

window.saveBatchQueueItemEditor = function (id, event) {
  if (event) event.stopPropagation();
  const item = batchQueue.find((q) => q.id === id || q.url === id);
  if (!item) return;
  const urlInput = document.getElementById(`edit_mob_url_${id}`);
  const qualitySelect = document.getElementById(`edit_mob_quality_${id}`);
  const typeSelect = document.getElementById(`edit_mob_type_${id}`);
  const filenameInput = document.getElementById(`edit_mob_filename_${id}`);
  if (urlInput?.value.trim()) item.url = urlInput.value.trim();
  if (qualitySelect) item.quality = qualitySelect.value;
  if (typeSelect) item.type = typeSelect.value;
  if (filenameInput) item.filename = filenameInput.value.trim();
  item.showEditor = false;
  if (item.status === 'error') item.status = 'pending';
  syncBatchTextarea();
  renderBatchQueueList();
};

function renderBatchQueueList() {
  if (!elements.batchQueueList) return;
  if (!batchQueue.length) {
    elements.batchQueueList.innerHTML = `<p class="fav-page-meta">لا توجد روابط في السلسلة</p>`;
    return;
  }

  elements.batchQueueList.innerHTML = batchQueue.map((item, idx) => {
    const statusText = item.status === 'pending'
      ? 'انتظار'
      : (item.status === 'downloading' ? 'تحميل' : (item.status === 'done' ? 'تم' : 'خطأ'));
    const badge = item.type === 'audio'
      ? 'MP3'
      : (item.quality && item.quality !== 'best' ? `${item.quality}p` : '');
    return `
      <div class="batch-item-wrapper">
        <div class="batch-item-card">
          <span class="batch-item-num">${idx + 1}</span>
          <span class="batch-item-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}${badge ? ` · ${escapeHtml(badge)}` : ''}</span>
          <span class="batch-item-status ${item.status || 'pending'}">${statusText}</span>
          <button type="button" class="icon-btn ghost" onclick="toggleBatchQueueItemEditor('${item.id}', event)" title="إعدادات" ${item.status === 'downloading' ? 'disabled' : ''}><i class="fas fa-cog"></i></button>
          <button type="button" class="icon-btn ghost" onclick="removeBatchItem('${item.id}', event)" title="حذف" ${item.status === 'downloading' ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
        </div>
        ${item.showEditor ? `
          <div class="batch-item-editor" onclick="event.stopPropagation()">
            <input type="text" id="edit_mob_url_${item.id}" value="${escapeHtml(item.url)}">
            <div class="icon-row" style="justify-content:stretch; gap:8px;">
              <select id="edit_mob_quality_${item.id}" style="flex:1; padding:8px; border-radius:12px; background:var(--bg-input); border:1px solid var(--border);">
                <option value="best" ${(item.quality || 'best') === 'best' ? 'selected' : ''}>MAX</option>
                <option value="360" ${item.quality === '360' ? 'selected' : ''}>360p</option>
                <option value="480" ${item.quality === '480' ? 'selected' : ''}>480p</option>
                <option value="720" ${item.quality === '720' ? 'selected' : ''}>720p</option>
                <option value="1080" ${item.quality === '1080' ? 'selected' : ''}>1080p</option>
                <option value="1440" ${item.quality === '1440' ? 'selected' : ''}>1440p</option>
                <option value="2160" ${item.quality === '2160' ? 'selected' : ''}>2160p</option>
              </select>
              <select id="edit_mob_type_${item.id}" style="flex:1; padding:8px; border-radius:12px; background:var(--bg-input); border:1px solid var(--border);">
                <option value="video-audio" ${(item.type || 'video-audio') === 'video-audio' ? 'selected' : ''}>فيديو+صوت</option>
                <option value="video-only" ${item.type === 'video-only' ? 'selected' : ''}>فيديو</option>
                <option value="audio" ${item.type === 'audio' ? 'selected' : ''}>MP3</option>
              </select>
            </div>
            <input type="text" id="edit_mob_filename_${item.id}" value="${escapeHtml(item.filename || '')}" placeholder="اسم الملف">
            <div class="icon-row">
              <button type="button" class="icon-fab primary" onclick="saveBatchQueueItemEditor('${item.id}', event)" title="حفظ"><i class="fas fa-check"></i></button>
              <button type="button" class="icon-fab" onclick="toggleBatchQueueItemEditor('${item.id}', event)" title="إغلاق"><i class="fas fa-times"></i></button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function updateBatchProgress(current, total, item) {
  const pct = Math.max(4, Math.round((current / Math.max(total, 1)) * 100));
  if (elements.progressPercent) elements.progressPercent.textContent = `${pct}%`;
  if (elements.progressFill) elements.progressFill.style.width = `${pct}%`;
  const label = `سلسلة ${current}/${total}: ${String(item?.url || '').slice(0, 42)}`;
  if (elements.progressInfo) elements.progressInfo.textContent = label;
  if (elements.batchProgressHint) elements.batchProgressHint.textContent = label;
}

async function downloadBatchItem(item, current, total) {
  if (!assertDownloadNetworkAllowed()) throw new Error(getNetworkBlockMessage() || t('downloadWifiOnlyBlocked') || 'التحميل غير مسموح على هذه الشبكة');
  item.status = 'downloading';
  item.error = '';
  renderBatchQueueList();
  updateBatchProgress(current, total, item);

  const data = await safeFetchJson('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: item.url,
      type: item.type || downloadType || 'video-audio',
      height: item.quality || selectedHeight || 'best',
      abr: (item.type || downloadType) === 'audio' ? (item.quality || selectedAudioAbr) : undefined,
      filename: item.filename || undefined,
      studioMode: 'full',
      mode: 'full',
      outputDir: getMobileOutputDir(),
      ...getMobileEngineOptions()
    })
  });

  if (!data?.success) throw new Error(data?.error || 'فشل التحميل');

  item.status = 'done';
  item.path = data.path || '';
  item.downloadUrl = data.downloadUrl || '';
  item.savedName = data.filename || item.filename || '';
  triggerMobileFileDownload(data);
  if (data.path) localStorage.setItem('vm_mobile_last_path', data.path);
  addToMobileHistory({
    title: item.savedName || item.url,
    url: item.url,
    type: item.type || downloadType || 'video-audio',
    path: data.path || '',
    filename: data.filename || '',
    downloadUrl: data.downloadUrl || ''
  });
}

async function startMobileBatch() {
  if (!assertDownloadNetworkAllowed()) return;
  updateBatchQueueFromText();
  batchQueue.forEach((item) => {
    if (item.status === 'error') item.status = 'pending';
  });
  const pending = batchQueue.filter((item) => item.status === 'pending');
  if (!pending.length) {
    showMobileToast(batchQueue.length ? 'لا توجد روابط بانتظار التحميل' : 'أضف روابط للسلسلة أولاً');
    return;
  }
  if (isBatchProcessing) return;

  isBatchProcessing = true;
  batchStopRequested = false;
  setBatchStartButton(true);
  elements.progressContainer?.classList.add('show');
  elements.successMessage?.classList.remove('show');
  openBatchPanel();

  let completed = 0;
  let failed = 0;
  const total = pending.length;
  let current = 0;

  for (const item of batchQueue) {
    if (batchStopRequested) break;
    if (item.status !== 'pending') continue;
    current += 1;
    try {
      await downloadBatchItem(item, current, total);
      completed += 1;
    } catch (err) {
      item.status = 'error';
      item.error = err.message || 'فشل التحميل';
      failed += 1;
      showMobileToast(item.error);
    }
    renderBatchQueueList();
  }

  const stopped = batchStopRequested;
  isBatchProcessing = false;
  batchStopRequested = false;
  setBatchStartButton(false);
  elements.progressContainer?.classList.remove('show');
  if (elements.batchProgressHint) {
    elements.batchProgressHint.textContent = stopped
      ? `توقفت السلسلة · نجح ${completed} · فشل ${failed}`
      : `اكتملت السلسلة · نجح ${completed} · فشل ${failed}`;
  }
  if (completed) {
    elements.successMessage?.classList.add('show');
    if (elements.successPath) {
      elements.successPath.textContent = `السلسلة: ${completed} نجح` + (failed ? ` · ${failed} فشل` : '');
    }
  }
  showMobileToast(`السلسلة: ${completed} نجح` + (failed ? ` · ${failed} فشل` : ''));
  notifyMobile(
    t('notifyDownloadTitle') || 'اكتمل التحميل',
    `السلسلة: ${completed} نجح` + (failed ? ` · ${failed} فشل` : '')
  );
}

elements.batchToggleBtn?.addEventListener('click', () => {
  const opening = elements.batchQueuePanel?.classList.contains('hidden');
  if (opening) {
    openBatchPanel();
    updateBatchQueueFromText();
    elements.batchUrlsText?.focus();
  } else {
    closeBatchPanel();
  }
});

elements.closeBatchBtn?.addEventListener('click', closeBatchPanel);

elements.pasteAddBatchBtn?.addEventListener('click', async () => {
  const text = await getPastedText('الصق روابط السلسلة ثم اضغط تأكيد');
  const added = addUrlsToBatch(extractUrlsFromText(text));
  showMobileToast(added ? `تمت إضافة ${added} رابط` : 'لا توجد روابط جديدة');
});

elements.batchAutoPasteBtn?.addEventListener('click', toggleBatchAutoPaste);

elements.batchUrlsText?.addEventListener('input', updateBatchQueueFromText);

elements.clearBatchBtn?.addEventListener('click', () => {
  if (isBatchProcessing) {
    showMobileToast('أوقف السلسلة أولاً');
    return;
  }
  batchQueue = [];
  if (elements.batchUrlsText) elements.batchUrlsText.value = '';
  if (elements.batchProgressHint) elements.batchProgressHint.textContent = '';
  renderBatchQueueList();
  updateStartBatchDisabled();
});

elements.startBatchBtn?.addEventListener('click', () => {
  if (isBatchProcessing) {
    batchStopRequested = true;
    showMobileToast('سيتوقف بعد الفيديو الحالي');
    return;
  }
  startMobileBatch();
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function saveMobileHistory() {
  localStorage.setItem('vm_mobile_history', JSON.stringify(downloadHistory.slice(0, 200)));
}

function addToMobileHistory(entry) {
  const item = {
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: entry.title || 'فيديو',
    thumbnail: entry.thumbnail || '',
    url: entry.url || '',
    type: entry.type || 'video-audio',
    path: entry.path || '',
    filename: entry.filename || '',
    downloadUrl: entry.downloadUrl || '',
    date: entry.date || new Date().toLocaleString('ar-SA')
  };
  downloadHistory = downloadHistory.filter((old) => !(item.path && old.path === item.path));
  downloadHistory.unshift(item);
  saveMobileHistory();
  updateHistoryUI();
}

function updateHistoryUI() {
  if (!elements.historyList) return;
  loadMobileHistory();
  if (downloadHistory.length === 0) {
    elements.historyList.innerHTML = `<p style="text-align:center; padding:28px 16px; color:var(--text-secondary);"><i class="fas fa-history" style="display:block;font-size:22px;margin-bottom:8px;"></i>لا يوجد سجل تحميلات بعد</p>`;
    return;
  }
  elements.historyList.innerHTML = downloadHistory.map((item, idx) => `
    <div class="history-row">
      ${item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="" class="history-thumb">` : `<div class="history-thumb history-thumb-empty"><i class="fas fa-film"></i></div>`}
      <div class="history-meta">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.date)}${item.type ? ` · ${escapeHtml(item.type)}` : ''}</span>
      </div>
      <button type="button" class="icon-btn ghost" onclick="playHistoryItem(${idx})" title="تشغيل"><i class="fas fa-play"></i></button>
      <button type="button" class="icon-btn ghost" onclick="openHistoryFolder(${idx})" title="المجلد"><i class="fas fa-folder-open"></i></button>
      <button type="button" class="icon-btn ghost" onclick="removeHistoryItem(${idx})" title="حذف"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

window.playHistoryItem = function (idx) {
  const item = downloadHistory[idx];
  if (!item) return;
  if (item.downloadUrl) {
    window.open(item.downloadUrl, '_blank');
    return;
  }
  if (item.url) window.open(item.url, '_blank', 'noopener');
};

window.openHistoryFolder = async function (idx) {
  const item = downloadHistory[idx];
  try {
    await safeFetchJson('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: item?.path || elements.customDownloadPath?.value || '' })
    });
  } catch (err) {
    alert(err.message || 'تعذر فتح المجلد');
  }
};

window.removeHistoryItem = function (idx) {
  downloadHistory.splice(idx, 1);
  saveMobileHistory();
  updateHistoryUI();
};

const MOBILE_PLATFORMS = [
  { name: 'YouTube', icon: 'fa-youtube', url: 'https://www.youtube.com' },
  { name: 'TikTok', icon: 'fa-tiktok', url: 'https://www.tiktok.com' },
  { name: 'Instagram', icon: 'fa-instagram', url: 'https://www.instagram.com' },
  { name: 'Facebook', icon: 'fa-facebook', url: 'https://www.facebook.com' },
  { name: 'X', icon: 'fa-x-twitter', url: 'https://x.com' },
  { name: 'Twitch', icon: 'fa-twitch', url: 'https://www.twitch.tv' },
  { name: 'Vimeo', icon: 'fa-vimeo', url: 'https://vimeo.com' },
  { name: 'SoundCloud', icon: 'fa-soundcloud', url: 'https://soundcloud.com' },
  { name: 'Reddit', icon: 'fa-reddit', url: 'https://www.reddit.com' },
  { name: 'Pinterest', icon: 'fa-pinterest', url: 'https://www.pinterest.com' },
  { name: 'Spotify', icon: 'fa-spotify', url: 'https://open.spotify.com' },
  { name: 'Telegram', icon: 'fa-telegram', url: 'https://telegram.org' }
];

function openPlatformSite(url) {
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

function populatePlatforms() {
  if (!elements.platformsGrid) return;
  elements.platformsGrid.innerHTML = MOBILE_PLATFORMS.map((p) => `
    <button type="button" class="platform-tile" data-url="${p.url}" title="${p.name}">
      <i class="fab ${p.icon}"></i>
      <h4>${p.name}</h4>
    </button>
  `).join('');

  elements.platformsGrid.querySelectorAll('.platform-tile').forEach((tile) => {
    tile.addEventListener('click', () => openPlatformSite(tile.dataset.url));
  });
}

document.querySelectorAll('.platform-chips .chip').forEach((chip) => {
  chip.style.cursor = 'pointer';
  chip.addEventListener('click', () => {
    const name = chip.getAttribute('title');
    const match = MOBILE_PLATFORMS.find((p) => p.name === name);
    openPlatformSite(match?.url);
  });
});

// 5. System Health Check & Auto Repair
async function fetchSystemHealth(status) {
  if (!elements.ytDlpHealth || !elements.ffmpegHealth) return status || null;
  let data = status;
  if (!data) {
    try {
      data = await safeFetchJson('/api/status');
    } catch {
      data = null;
    }
  }
  if (data?.ytDlp) {
    elements.ytDlpHealth.innerHTML = `<i class="fas fa-check-circle"></i> جاهز ومحين (${data.version || 'yt-dlp'})`;
    elements.ytDlpHealth.style.color = '#22c55e';
  } else {
    elements.ytDlpHealth.innerHTML = `<i class="fas fa-exclamation-triangle"></i> يتطلب إصلاح`;
    elements.ytDlpHealth.style.color = '#eab308';
  }
  if (data?.ffmpeg) {
    elements.ffmpegHealth.innerHTML = `<i class="fas fa-check-circle"></i> جاهز وفعال`;
    elements.ffmpegHealth.style.color = '#22c55e';
  } else {
    elements.ffmpegHealth.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ffmpeg غير متوفر`;
    elements.ffmpegHealth.style.color = '#f59e0b';
  }
  return data;
}

// Default Download Folder & Browse Action
const savedPath = localStorage.getItem('vm_mobile_save_path') || '';
if (elements.customDownloadPath) {
  elements.customDownloadPath.value = (!savedPath || savedPath === 'B:\\' || savedPath === 'B:') ? '' : savedPath;
}
safeFetchJson('/api/status').then((data) => {
  const dir = data?.downloadsDir || '';
  if (!dir) return;
  const current = localStorage.getItem('vm_mobile_save_path') || '';
  if (!current || current === 'B:\\' || current === 'B:') {
    if (elements.customDownloadPath) elements.customDownloadPath.value = dir;
    localStorage.setItem('vm_mobile_save_path', dir);
  }
}).catch(() => {});

const persistDownloadPath = () => {
  const value = String(elements.customDownloadPath?.value || '').trim();
  localStorage.setItem('vm_mobile_save_path', value);
};
elements.customDownloadPath?.addEventListener('change', persistDownloadPath);
elements.customDownloadPath?.addEventListener('blur', persistDownloadPath);

elements.browseDownloadPathBtn?.addEventListener('click', pickDownloadFolder);
elements.choosePathBtn?.addEventListener('click', pickDownloadFolder);

// Settings Batch Queue Logic
let settingsBatchQueue = [];

elements.settingsPasteAddBatchBtn?.addEventListener('click', async () => {
  try {
    let text = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
    if (!text || !text.trim()) {
      text = prompt('ألصق الروابط المتتالية هنا (رابط في كل سطر):');
    }
    if (text && text.trim()) {
      const existing = elements.settingsBatchUrlsText.value ? elements.settingsBatchUrlsText.value + '\n' : '';
      elements.settingsBatchUrlsText.value = existing + text.trim();
      updateSettingsBatchQueue();
    }
  } catch (err) {
    const text = prompt('ألصق الروابط المتتالية هنا (رابط في كل سطر):');
    if (text && text.trim()) {
      const existing = elements.settingsBatchUrlsText.value ? elements.settingsBatchUrlsText.value + '\n' : '';
      elements.settingsBatchUrlsText.value = existing + text.trim();
      updateSettingsBatchQueue();
    }
  }
});

elements.settingsBatchUrlsText?.addEventListener('input', updateSettingsBatchQueue);

function updateSettingsBatchQueue() {
  if (!elements.settingsBatchUrlsText) return;
  const lines = elements.settingsBatchUrlsText.value.split('\n').map(l => l.trim()).filter(l => /^https?:\/\//i.test(l));
  settingsBatchQueue = [...new Set(lines)];
  renderSettingsBatchQueueList();
  if (elements.settingsStartBatchBtn) {
    elements.settingsStartBatchBtn.disabled = settingsBatchQueue.length === 0;
  }
}

function renderSettingsBatchQueueList() {
  if (!elements.settingsBatchQueueList) return;
  if (settingsBatchQueue.length === 0) {
    elements.settingsBatchQueueList.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding:6px;">لا توجد روابط في القائمة</p>`;
    return;
  }
  elements.settingsBatchQueueList.innerHTML = settingsBatchQueue.map((url, idx) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--bg-input); border-radius:8px; margin-bottom:6px; font-size:12px;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">${idx + 1}. ${url}</span>
      <button type="button" onclick="removeSettingsBatchItem(${idx})" style="background:none; border:none; color:#ef4444; font-size:14px; cursor:pointer;"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

window.removeSettingsBatchItem = function(index) {
  settingsBatchQueue.splice(index, 1);
  if (elements.settingsBatchUrlsText) elements.settingsBatchUrlsText.value = settingsBatchQueue.join('\n');
  updateSettingsBatchQueue();
};

elements.settingsClearBatchBtn?.addEventListener('click', () => {
  settingsBatchQueue = [];
  if (elements.settingsBatchUrlsText) elements.settingsBatchUrlsText.value = '';
  updateSettingsBatchQueue();
});

elements.settingsStartBatchBtn?.addEventListener('click', async () => {
  if (settingsBatchQueue.length === 0) return;
  if (!assertDownloadNetworkAllowed()) return;

  elements.settingsStartBatchBtn.disabled = true;
  elements.settingsStartBatchBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري تحميل السلسلة تلقائياً...`;

  const total = settingsBatchQueue.length;
  let completed = 0;
  const targetDir = getMobileOutputDir();
  const defaultQual = elements.defaultQualitySelect?.value || 'best';

  for (let i = 0; i < total; i++) {
    const url = settingsBatchQueue[i];
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          type: defaultQual === 'audio' ? 'audio' : 'video-audio',
          height: defaultQual === 'audio' ? 'best' : defaultQual,
          outputDir: targetDir,
          ...getMobileEngineOptions()
        })
      });
      const data = await res.json();
      if (data.success) completed++;
    } catch (err) {
      console.warn(`Settings batch error for ${url}:`, err);
    }
  }

  elements.settingsStartBatchBtn.disabled = false;
  elements.settingsStartBatchBtn.innerHTML = `<i class="fas fa-play"></i> <span>بدء تحميل السلسلة تلقائياً</span>`;
  notifyMobile(t('notifyDownloadTitle') || 'اكتمل التحميل', `السلسلة: ${completed}/${total}`);
  alert(`اكتمل تحميل السلسلة بنجاح تلقائياً (${completed}/${total}) في مجلد: ${targetDir}`);
  settingsBatchQueue = [];
  if (elements.settingsBatchUrlsText) elements.settingsBatchUrlsText.value = '';
  updateSettingsBatchQueue();
});

// Full i18n Multi-Language Translation Engine
function applyLanguage(lang) {
  const currentLang = lang || localStorage.getItem('vm_mobile_lang') || 'ar';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  if (typeof translations === 'undefined' || !translations[currentLang]) return;

  const t = translations[currentLang];
  if (typeof currentLanguage !== 'undefined') currentLanguage = currentLang;

  // Translate placeholders and text elements
  if (elements.videoUrl && t.urlPlaceholder) elements.videoUrl.placeholder = t.urlPlaceholder;
  if (elements.filenameInput && t.filenamePlaceholder) elements.filenameInput.placeholder = t.filenamePlaceholder;

  // Translate navigation buttons
  const navBtns = document.querySelectorAll('.nav-button');
  if (navBtns[0] && (t.navHome || t.navDownload)) navBtns[0].title = t.navHome || t.navDownload;
  if (navBtns[1] && t.navFavorites) navBtns[1].title = t.navFavorites || 'Favorites';
  if (navBtns[2] && t.navWatchLater) navBtns[2].title = t.navWatchLater || 'Later';
  if (navBtns[3] && t.navHistory) navBtns[3].title = t.navHistory;
  if (navBtns[4] && t.navPlatforms) navBtns[4].title = t.navPlatforms;
  if (navBtns[5] && t.navSettings) navBtns[5].title = t.navSettings;
  const typeTabs = document.querySelectorAll('#downloadTypeTabs .type-pill');
  if (typeTabs[0] && (t.downloadVideoAudio || t.videoAudio)) {
    typeTabs[0].title = t.downloadVideoAudio || t.videoAudio;
  }
  if (typeTabs[1] && (t.downloadVideoOnly || t.typeVideoOnly || t.videoOnly)) {
    typeTabs[1].title = t.downloadVideoOnly || t.typeVideoOnly || t.videoOnly;
  }
  if (typeTabs[2] && (t.downloadAudioOnly || t.audioMp3)) typeTabs[2].title = t.downloadAudioOnly || t.audioMp3;

  const wlTitle = document.getElementById('watchLaterTitleLabel');
  const wlDesc = document.getElementById('watchLaterDesc');
  const wlUrl = document.getElementById('watchLaterUrlInput');
  const wlTitleInput = document.getElementById('watchLaterTitleInput');
  const wlChannel = document.getElementById('watchLaterChannelInput');
  if (wlTitle && t.watchLaterTitle) wlTitle.textContent = t.watchLaterTitle;
  if (wlDesc && t.watchLaterDesc) wlDesc.textContent = t.watchLaterDesc;
  if (wlUrl && t.watchLaterUrlPlaceholder) wlUrl.placeholder = t.watchLaterUrlPlaceholder;
  if (wlTitleInput && t.watchLaterTitlePlaceholder) wlTitleInput.placeholder = t.watchLaterTitlePlaceholder;
  if (wlChannel && t.watchLaterChannelPlaceholder) wlChannel.placeholder = t.watchLaterChannelPlaceholder;
  try { updateImageModeUi(); } catch { /* ignore */ }
  try { updateDownloadButtonText(); } catch { /* ignore */ }
  try { if (typeof applyTranslations === 'function') applyTranslations(); } catch { /* ignore */ }
  try { updateAspectBadge(); } catch { /* ignore */ }
  try { updateGlobalSettingsBadge(); } catch { /* ignore */ }
  try { if (typeof renderMobileWatchLater === 'function') renderMobileWatchLater(); } catch { /* ignore */ }
  if (elements.defaultQualitySelect && t.defaultQuality) elements.defaultQualitySelect.title = t.defaultQuality;
  if (elements.speedLimitSelect && t.speedLimitLabel) elements.speedLimitSelect.title = t.speedLimitLabel;
  if (elements.autoRetrySelect && t.autoRetryLabel) elements.autoRetrySelect.title = t.autoRetryLabel;
  if (elements.browseDownloadPathBtn && t.browse) elements.browseDownloadPathBtn.title = t.browse;
  if (elements.clearCacheBtn && t.clearCache) elements.clearCacheBtn.title = t.clearCache;
  if (elements.repairSystemBtn && (t.repairSystem || t.repairRunning)) {
    elements.repairSystemBtn.title = t.repairSystem || 'إصلاح الأخطاء وفحص النظام';
  }
  if (elements.openLastVideoFolderBtn && t.showInFolder) elements.openLastVideoFolderBtn.title = t.showInFolder;
  if (elements.scheduleStartBtn && t.schedulerBtn) elements.scheduleStartBtn.title = t.schedulerBtn;
  if (elements.scheduleCancelBtn && t.schedulerCancel) elements.scheduleCancelBtn.title = t.schedulerCancel;
}

function switchMobileTab(tab) {
  if (!tab) return;
  document.querySelectorAll('.nav-button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-view').forEach((tv) => tv.classList.remove('active'));
  const targetTab = document.getElementById(`${tab}Tab`);
  if (targetTab) targetTab.classList.add('active');
  if (tab === 'history') updateHistoryUI();
  if (tab === 'favorites') renderMobileFavorites();
  if (tab === 'watchlater') renderMobileWatchLater();
  if (tab === 'downloader') {
    startClipboardWatcher();
    document.querySelector('.mobile-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (tab === 'settings') {
    refreshMobileSettingsUi();
    fetchSystemHealth().catch(() => {});
    document.querySelector('.mobile-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

document.querySelectorAll('.nav-button').forEach((btn) => {
  btn.addEventListener('click', () => switchMobileTab(btn.dataset.tab));
});

document.querySelector('.mobile-brand')?.addEventListener('click', () => switchMobileTab('downloader'));
document.querySelector('.mobile-brand')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    switchMobileTab('downloader');
  }
});

elements.languageSelect?.addEventListener('change', (e) => {
  const newLang = e.target.value;
  localStorage.setItem('vm_mobile_lang', newLang);
  applyLanguage(newLang);
  refreshMobileSettingsUi();
  showMobileToast(t('langChanged') || 'تم تغيير اللغة');
});

// Initialize Language on Startup
const savedLang = localStorage.getItem('vm_mobile_lang') || 'ar';
if (elements.languageSelect) elements.languageSelect.value = savedLang;
applyLanguage(savedLang);

elements.defaultQualitySelect?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_quality', e.target.value);
  selectedHeight = e.target.value || 'best';
  try { renderQualityGrid(); } catch { /* ignore */ }
  showMobileToast(e.target.value === 'best'
    ? (t('qualityBest') || 'أقصى جودة متاحة (بدون سقف — حتى 8K)')
    : `${e.target.value}p`);
});

function initMobileSettingsToggles() {
  const turbo = elements.turboMode;
  const audio = elements.audioEnhanceToggle;
  const clipboard = elements.autoClipboardToggle;
  const notifications = elements.notificationsToggle;

  if (turbo) turbo.checked = isTurboEnabled();
  if (audio) audio.checked = isAudioEnhanceEnabled();
  if (clipboard) clipboard.checked = isClipboardAutoEnabled();
  if (notifications) notifications.checked = isNotificationsEnabled();
  syncDownloadNetworkButtons();

  if (elements.defaultQualitySelect) {
    const savedQuality = localStorage.getItem('vm_mobile_quality');
    if (savedQuality) elements.defaultQualitySelect.value = savedQuality;
  }
  if (elements.speedLimitSelect) {
    elements.speedLimitSelect.value = localStorage.getItem(SETTINGS_KEYS.speedLimit) || 'unlimited';
  }
  if (elements.autoRetrySelect) {
    elements.autoRetrySelect.value = String(localStorage.getItem(SETTINGS_KEYS.retries) || '10');
  }

  turbo?.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEYS.turbo, turbo.checked ? 'true' : 'false');
    showMobileToast(turbo.checked ? (t('turboOn') || 'تم تفعيل وضع التوربو') : (t('turboOff') || 'تم إيقاف وضع التوربو'));
  });
  audio?.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEYS.audioEnhance, audio.checked ? 'true' : 'false');
    showMobileToast(audio.checked ? (t('audioEnhanceOn') || 'تم تفعيل تحسين الصوت') : (t('audioEnhanceOff') || 'تم إيقاف تحسين الصوت'));
  });
  clipboard?.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEYS.clipboard, clipboard.checked ? 'true' : 'false');
    if (clipboard.checked) startClipboardWatcher();
    else stopClipboardWatcher();
    showMobileToast(clipboard.checked ? (t('clipboardAutoOn') || 'تم تفعيل اكتشاف الحافظة') : (t('clipboardAutoOff') || 'تم إيقاف اكتشاف الحافظة'));
  });
  notifications?.addEventListener('change', async () => {
    localStorage.setItem(SETTINGS_KEYS.notifications, notifications.checked ? 'true' : 'false');
    if (notifications.checked) {
      const granted = await ensureNotificationPermission();
      if (granted) {
        notifyMobile(t('notificationsOn') || 'تم تفعيل الإشعارات', t('notifyDownloadBody') || 'ستصلك تنبيهات عند اكتمال التحميل');
      } else if ('Notification' in window && Notification.permission === 'denied') {
        notifications.checked = false;
        localStorage.setItem(SETTINGS_KEYS.notifications, 'false');
        showMobileToast(t('notificationsDenied') || 'الإشعارات محظورة من المتصفح');
        return;
      }
    }
    showMobileToast(notifications.checked ? (t('notificationsOn') || 'تم تفعيل الإشعارات') : (t('notificationsOff') || 'تم إيقاف الإشعارات'));
  });

  const setNetworkMode = (mode) => {
    const next = mode === 'wifi' || mode === 'cellular' ? mode : 'both';
    localStorage.setItem(SETTINGS_KEYS.network, next);
    syncDownloadNetworkButtons();
    const messages = {
      wifi: t('downloadWifiOnlyOn') || 'التحميل عبر الواي فاي فقط',
      cellular: t('downloadCellularOn') || 'التحميل عبر باقة النت فقط',
      both: t('downloadBothOn') || 'التحميل عبر الواي فاي وباقة النت معاً'
    };
    showMobileToast(messages[next]);
  };
  elements.downloadWifiOnlyBtn?.addEventListener('click', () => setNetworkMode('wifi'));
  elements.downloadCellularBtn?.addEventListener('click', () => setNetworkMode('cellular'));
  elements.downloadBothBtn?.addEventListener('click', () => setNetworkMode('both'));
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  conn?.addEventListener?.('change', () => {
    if (!isMobileDownloadBusy()) return;
    const message = getNetworkBlockMessage();
    if (message) showMobileToast(message);
  });

  elements.speedLimitSelect?.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEYS.speedLimit, elements.speedLimitSelect.value || 'unlimited');
    const label = elements.speedLimitSelect.selectedOptions?.[0]?.textContent || elements.speedLimitSelect.value;
    showMobileToast(label);
  });
  elements.autoRetrySelect?.addEventListener('change', () => {
    localStorage.setItem(SETTINGS_KEYS.retries, String(getAutoRetryCount()));
    const label = elements.autoRetrySelect.selectedOptions?.[0]?.textContent || `${getAutoRetryCount()}`;
    showMobileToast(label);
  });
  elements.scheduleStartBtn?.addEventListener('click', activateMobileSchedule);
  elements.scheduleCancelBtn?.addEventListener('click', () => clearMobileSchedule(true));
  restoreMobileSchedule();
  refreshMobileSettingsUi();

  startClipboardWatcher();
  if (isNotificationsEnabled()) ensureNotificationPermission();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isClipboardAutoEnabled()) pollClipboardForVideoLink();
  });
}

initMobileSettingsToggles();

document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
  if (!confirm('مسح سجل التحميلات؟')) return;
  downloadHistory = [];
  saveMobileHistory();
  updateHistoryUI();
});

async function clearMobileAppCache() {
  const btn = document.getElementById('clearCacheBtn');
  const icon = btn?.querySelector('i');
  if (btn) btn.disabled = true;
  if (icon) icon.className = 'fas fa-spinner fa-spin';
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.update().catch(() => {})));
    }
    try {
      const result = await safeFetchJson('/api/clear-cache', { method: 'POST' });
      const removed = Number(result?.removed || 0);
      showMobileToast(removed
        ? `${t('cacheCleared') || 'تم مسح الذاكرة المؤقتة'} (${removed})`
        : (t('cacheCleared') || 'تم مسح الذاكرة المؤقتة'));
    } catch {
      showMobileToast(t('cacheCleared') || 'تم مسح الذاكرة المؤقتة');
    }
  } catch (error) {
    showMobileToast(error.message || 'تعذر مسح الذاكرة المؤقتة');
  } finally {
    if (icon) icon.className = 'fas fa-trash-alt';
    if (btn) btn.disabled = false;
  }
}

async function repairMobileSystem() {
  const btn = document.getElementById('repairSystemBtn');
  const icon = btn?.querySelector('i');
  if (btn) btn.disabled = true;
  if (icon) icon.className = 'fas fa-spinner fa-spin';
  showMobileToast(t('repairRunning') || 'جاري الإصلاح التلقائي...');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.update().catch(() => {})));
    }
    const result = await safeFetchJson('/api/repair', { method: 'POST' });
    await fetchSystemHealth(result);
    showMobileToast(result?.success === false
      ? (t('repairFailed') || 'فشل الإصلاح — أعد تشغيل التطبيق')
      : (t('repairSuccess') || 'تم الإصلاح — التطبيق جاهز'));
  } catch (error) {
    await fetchSystemHealth();
    showMobileToast(error.message || t('repairFailed') || 'فشل الإصلاح');
  } finally {
    if (icon) icon.className = 'fas fa-wrench';
    if (btn) btn.disabled = false;
  }
}

document.querySelectorAll('#downloadTypeTabs .type-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#downloadTypeTabs .type-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    downloadType = btn.dataset.type || 'video-audio';
    renderQualityGrid();
    updateDownloadButtonText();
    updateGlobalSettingsBadge();
    refreshLivePreview();
    if (downloadType === 'audio') {
      showMobileToast(t('downloadAudioOnly') || 'تحميل صوت فقط');
    } else if (downloadType === 'video-only') {
      showMobileToast(t('downloadVideoOnly') || t('typeVideoOnly') || 'فيديو بدون صوت');
    } else {
      showMobileToast(t('downloadVideoAudio') || t('videoAudio') || 'فيديو مع صوت');
    }
  });
});

function countMobileUnread(ch) {
  const items = ch ? (ch.unread || []) : mobileFavorites.flatMap((c) => c.unread || []);
  return items.filter((u) => !u.read).length;
}

function showMobileToast(message) {
  let toast = document.getElementById('mobileToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mobileToast';
    toast.className = 'mobile-toast';
    (document.querySelector('.phone-app') || document.body).appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showMobileToast.timer);
  showMobileToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function notifyMobileFavorite(title, body) {
  notifyMobile(title, body);
}

function clampMobileFavPage() {
  const totalPages = Math.max(1, Math.ceil(mobileFavorites.length / MOBILE_FAV_PAGE_SIZE) || 1);
  if (mobileFavPage >= totalPages) mobileFavPage = totalPages - 1;
  if (mobileFavPage < 0) mobileFavPage = 0;
  return totalPages;
}

function getMobileFavSlice() {
  const total = mobileFavorites.length;
  const totalPages = clampMobileFavPage();
  const start = mobileFavPage * MOBILE_FAV_PAGE_SIZE;
  const end = Math.min(total, start + MOBILE_FAV_PAGE_SIZE);
  return { start, end, total, totalPages, items: mobileFavorites.slice(start, end) };
}

function saveMobileFavorites() {
  localStorage.setItem('vm_mobile_favorites', JSON.stringify(mobileFavorites));
  const unread = countMobileUnread();
  const badge = document.getElementById('mobileFavCount');
  if (badge) {
    const value = unread || mobileFavorites.length;
    badge.textContent = String(value);
    const hide = mobileFavorites.length === 0;
    badge.classList.toggle('hidden', hide);
    badge.hidden = hide;
  }
  const globalBadge = document.getElementById('favoritesGlobalBellCount');
  if (globalBadge) {
    globalBadge.textContent = String(unread);
    globalBadge.classList.toggle('hidden', unread === 0);
    globalBadge.hidden = unread === 0;
  }
}

function renderMobileFavUnread(ch) {
  const unread = ch.unread || [];
  if (!unread.length) {
    return `<p class="fav-page-meta">لا توجد إشعارات</p>`;
  }
  return `<div class="fav-unread-list">${unread.map((item) => `
    <div class="fav-unread-item ${item.read ? 'is-read' : ''}" data-fav-id="${escapeHtml(ch.id)}">
      <span title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || item.id)}</span>
      <a class="icon-btn ghost" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" data-fav-action="open" data-url="${escapeHtml(item.url || '')}" title="فتح"><i class="fas fa-play"></i></a>
      ${item.read ? '' : `<button type="button" class="icon-btn ghost" data-fav-action="mark-read" data-channel-id="${escapeHtml(ch.id)}" data-video-id="${escapeHtml(item.id)}" title="مقروء"><i class="fas fa-check"></i></button>`}
      <button type="button" class="icon-btn ghost" data-fav-action="delete-notice" data-channel-id="${escapeHtml(ch.id)}" data-video-id="${escapeHtml(item.id)}" title="حذف"><i class="fas fa-times"></i></button>
    </div>
  `).join('')}</div>`;
}

function renderMobileGlobalInbox() {
  const box = document.getElementById('favoritesGlobalInbox');
  if (!box) return;
  if (!mobileFavGlobalInboxOpen) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const items = mobileFavorites.flatMap((ch) => (ch.unread || []).map((u) => ({ ...u, channelId: ch.id, channelName: ch.name })))
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  box.classList.remove('hidden');
  if (!items.length) {
    box.innerHTML = `<p class="fav-page-meta">لا توجد إشعارات جديدة</p>`;
    return;
  }
  box.innerHTML = `<div class="fav-unread-list">${items.map((item) => `
    <div class="fav-unread-item ${item.read ? 'is-read' : ''}" data-fav-id="${escapeHtml(item.channelId)}">
      <span title="${escapeHtml(item.title || '')}"><b>${escapeHtml(item.channelName || '')}</b> · ${escapeHtml(item.title || item.id)}</span>
      <a class="icon-btn ghost" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" data-fav-action="open" data-url="${escapeHtml(item.url || '')}" title="فتح"><i class="fas fa-play"></i></a>
      ${item.read ? '' : `<button type="button" class="icon-btn ghost" data-fav-action="mark-read" data-channel-id="${escapeHtml(item.channelId)}" data-video-id="${escapeHtml(item.id)}" title="مقروء"><i class="fas fa-check"></i></button>`}
      <button type="button" class="icon-btn ghost" data-fav-action="delete-notice" data-channel-id="${escapeHtml(item.channelId)}" data-video-id="${escapeHtml(item.id)}" title="حذف"><i class="fas fa-times"></i></button>
    </div>
  `).join('')}</div>`;
}

function renderMobileFavorites() {
  const list = document.getElementById('favoritesList');
  const pager = document.getElementById('favoritesPager');
  const rangeEl = document.getElementById('favPageRange');
  const metaEl = document.getElementById('favPageMeta');
  if (!list) return;

  saveMobileFavorites();
  renderMobileGlobalInbox();

  if (!mobileFavorites.length) {
    list.innerHTML = `<p style="text-align:center;color:var(--text-secondary);padding:12px;"><i class="fas fa-star"></i></p>`;
    if (pager) pager.classList.add('hidden');
    if (metaEl) metaEl.textContent = '';
    bindMobileFavoriteActions();
    return;
  }

  const slice = getMobileFavSlice();
  if (pager) pager.classList.toggle('hidden', slice.total <= MOBILE_FAV_PAGE_SIZE);
  if (rangeEl) {
    const from = slice.total ? slice.start + 1 : 0;
    rangeEl.textContent = slice.total ? `${from}–${slice.end}` : '0';
  }
  if (metaEl) {
    metaEl.textContent = `صفحة ${slice.totalPages ? mobileFavPage + 1 : 1} / ${slice.totalPages} · ${slice.total} قناة`;
  }

  list.innerHTML = slice.items.map((item, i) => {
    const index = slice.start + i + 1;
    const unread = countMobileUnread(item);
    const expanded = mobileFavExpandedId === item.id;
    return `
    <div class="fav-row" data-fav-id="${escapeHtml(item.id)}" data-fav-url="${escapeHtml(item.url)}">
      <div class="fav-row-main">
        <span class="fav-index">${index}</span>
        <strong title="${escapeHtml(item.url)}">${escapeHtml(item.name || item.url)}</strong>
        <div class="fav-actions">
          <button type="button" class="icon-btn ghost fav-bell-btn ${unread ? 'has-unread' : ''}" data-fav-action="bell" title="تنبيه">
            <i class="fas fa-bell"></i>
            ${unread ? `<span class="nav-badge">${unread}</span>` : ''}
          </button>
          <button type="button" class="icon-btn ghost" data-fav-action="check" title="فحص"><i class="fas fa-sync-alt"></i></button>
          <a class="icon-btn ghost" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-fav-action="open" data-url="${escapeHtml(item.url)}" title="فتح"><i class="fas fa-external-link-alt"></i></a>
          <button type="button" class="icon-btn ghost" data-fav-action="remove" title="حذف"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      ${expanded ? renderMobileFavUnread(item) : ''}
    </div>`;
  }).join('');
  bindMobileFavoriteActions();
}

window.removeMobileFavorite = function (id) {
  mobileFavorites = mobileFavorites.filter((c) => c.id !== id);
  if (mobileFavExpandedId === id) mobileFavExpandedId = null;
  saveMobileFavorites();
  renderMobileFavorites();
};

window.openMobileLink = function (url) {
  if (!url) return;
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    fetch('/api/open-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    }).catch(() => {
      location.href = url;
    });
  }
};

function handleMobileFavClick(event) {
  const btn = event.target.closest('[data-fav-action]');
  if (!btn) return;
  const action = btn.dataset.favAction;
  const row = btn.closest('[data-fav-id]');
  const channelId = btn.dataset.channelId || row?.dataset.favId || '';
  const videoId = btn.dataset.videoId || '';
  const url = btn.dataset.url || row?.dataset.favUrl || '';

  if (action === 'open') {
    if (btn.tagName === 'A') return;
    event.preventDefault();
    openMobileLink(url);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (action === 'bell') toggleMobileFavUnread(channelId);
  else if (action === 'check') {
    showMobileToast('جاري فحص القناة...');
    checkMobileFavorite(channelId);
  } else if (action === 'remove') removeMobileFavorite(channelId);
  else if (action === 'mark-read') markMobileFavRead(channelId, videoId);
  else if (action === 'delete-notice') deleteMobileFavNotice(channelId, videoId);
}

function bindMobileFavoriteActions() {
  const root = document.getElementById('favoritesTab');
  if (!root) return;
  root.querySelectorAll('[data-fav-action]').forEach((btn) => {
    btn.addEventListener('click', handleMobileFavClick);
  });
}

window.toggleMobileFavUnread = function (id) {
  mobileFavExpandedId = mobileFavExpandedId === id ? null : id;
  renderMobileFavorites();
};

window.markMobileFavRead = function (channelId, videoId) {
  const ch = mobileFavorites.find((c) => c.id === channelId);
  if (!ch) return;
  (ch.unread || []).forEach((u) => {
    if (u.id === videoId) u.read = true;
  });
  saveMobileFavorites();
  renderMobileFavorites();
};

window.deleteMobileFavNotice = function (channelId, videoId) {
  const ch = mobileFavorites.find((c) => c.id === channelId);
  if (!ch) return;
  ch.unread = (ch.unread || []).filter((u) => u.id !== videoId);
  saveMobileFavorites();
  renderMobileFavorites();
};

async function fetchMobileChannelUpdates(url) {
  const data = await safeFetchJson('/api/channel-updates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, limit: 8 })
  });
  if (!data?.success) throw new Error(data?.error || 'فشل فحص القناة');
  return data.data || {};
}

async function checkMobileFavoriteChannel(id, { manual = false, seedOnly = false } = {}) {
  const ch = mobileFavorites.find((c) => c.id === id);
  if (!ch) return { ok: false };
  try {
    const result = await fetchMobileChannelUpdates(ch.url);
    const entries = result.entries || [];
    if (result.name) {
      ch.name = preferMobileChannelName(ch.name, result.name, ch.url);
    }
    ch.lastChecked = Date.now();
    const seen = new Set(ch.lastSeenIds || []);
    const isFirstSeed = seedOnly || seen.size === 0;
    if (isFirstSeed) {
      ch.lastSeenIds = entries.map((e) => e.id).slice(0, 40);
      if (!ch.unread) ch.unread = [];
    } else {
      const fresh = [];
      for (const entry of entries) {
        if (!seen.has(entry.id)) {
          fresh.push({
            id: entry.id,
            title: entry.title,
            url: entry.url,
            addedAt: Date.now(),
            read: false
          });
        }
      }
      if (fresh.length) {
        const existingIds = new Set((ch.unread || []).map((u) => u.id));
        ch.unread = [...fresh.filter((f) => !existingIds.has(f.id)), ...(ch.unread || [])].slice(0, 30);
        fresh.forEach((f) => seen.add(f.id));
        ch.lastSeenIds = Array.from(seen).slice(0, 40);
        if (ch.notifyEnabled !== false) {
          notifyMobileFavorite(ch.name, fresh[0].title + (fresh.length > 1 ? ` (+${fresh.length - 1})` : ''));
        }
        mobileFavExpandedId = ch.id;
      } else if (manual) {
        showMobileToast('لا توجد فيديوهات جديدة');
      }
    }
    saveMobileFavorites();
    renderMobileFavorites();
    return { ok: true, newCount: isFirstSeed ? 0 : countMobileUnread(ch) };
  } catch (error) {
    if (manual) showMobileToast(error.message || 'فشل فحص القناة');
    return { ok: false, error: error.message };
  }
}

window.checkMobileFavorite = function (id) {
  checkMobileFavoriteChannel(id, { manual: true });
};

function extractFavoriteUrls(text) {
  const raw = String(text || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!raw) return [];
  const found = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let match;
  while ((match = re.exec(raw))) {
    found.push(match[0].replace(/[),.;]+$/g, ''));
  }
  if (!found.length) {
    const line = raw.replace(/^\/+/, '').split(/\s+/)[0];
    if (/^@[^\s]+$/u.test(line)) found.push(`https://www.youtube.com/${line}`);
    else if (/youtube\.com|youtu\.be/i.test(line)) {
      found.push(/^https?:\/\//i.test(line) ? line : `https://${line}`);
    }
  }
  const urls = [];
  for (const item of found) {
    try {
      urls.push(normalizeMobileUrl(item));
    } catch {
      if (/^https?:\/\//i.test(item)) urls.push(item);
    }
  }
  return [...new Set(urls)];
}

async function addMobileFavoriteFromText(text) {
  const urls = extractFavoriteUrls(text);
  if (!urls.length) {
    showMobileToast('الصق أو اكتب رابط القناة أولاً');
    return false;
  }
  const toAdd = [];
  for (const url of urls) {
    const key = mobileUrlKey(url);
    if (mobileFavorites.some((f) => mobileUrlKey(f.url) === key)) continue;
    toAdd.push({
      id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url,
      name: guessMobileChannelName(url),
      lastSeenIds: [],
      unread: [],
      lastChecked: 0,
      notifyEnabled: true
    });
  }
  if (!toAdd.length) {
    showMobileToast('القناة موجودة مسبقاً');
    return false;
  }
  mobileFavorites = [...toAdd, ...mobileFavorites];
  mobileFavPage = 0;
  saveMobileFavorites();
  renderMobileFavorites();
  showMobileToast(toAdd.length > 1 ? `تمت إضافة ${toAdd.length} قنوات` : 'تمت إضافة القناة');
  const input = document.getElementById('favoriteChannelInput');
  if (input) input.value = '';
  for (const ch of toAdd) {
    await checkMobileFavoriteChannel(ch.id, { seedOnly: true });
  }
  return true;
}

async function onAddFavoriteClick() {
  const input = document.getElementById('favoriteChannelInput');
  await addMobileFavoriteFromText(input?.value || '');
}

async function onPasteFavoriteClick() {
  showMobileToast('جاري اللصق...');
  const text = await getPastedText('الصق رابط القناة ثم اضغط تأكيد');
  if (!String(text || '').trim()) {
    showMobileToast('لم يتم العثور على رابط');
    return;
  }
  const input = document.getElementById('favoriteChannelInput');
  if (input) input.value = String(text).trim();
  await addMobileFavoriteFromText(text);
}

document.addEventListener('click', (event) => {
  if (event.target.closest('#addFavoriteBtn')) {
    event.preventDefault();
    onAddFavoriteClick();
    return;
  }
  if (event.target.closest('#pasteFavoriteBtn')) {
    event.preventDefault();
    onPasteFavoriteClick();
    return;
  }
  if (event.target.closest('#clearCacheBtn')) {
    event.preventDefault();
    clearMobileAppCache();
    return;
  }
  if (event.target.closest('#repairSystemBtn')) {
    event.preventDefault();
    repairMobileSystem();
  }
}, true);
document.getElementById('checkAllFavoritesBtn')?.addEventListener('click', async () => {
  if (mobileFavChecking || !mobileFavorites.length) {
    if (!mobileFavorites.length) showMobileToast('لا توجد قنوات مفضلة');
    return;
  }
  mobileFavChecking = true;
  const btn = document.getElementById('checkAllFavoritesBtn');
  const icon = btn?.querySelector('i');
  icon?.classList.add('fa-spin');
  try {
    let fresh = 0;
    for (const ch of mobileFavorites) {
      const result = await checkMobileFavoriteChannel(ch.id, { manual: false });
      if (result?.ok) fresh += result.newCount || 0;
    }
    showMobileToast(fresh ? `${fresh} إشعار جديد` : 'تم فحص كل القنوات');
  } finally {
    icon?.classList.remove('fa-spin');
    mobileFavChecking = false;
    renderMobileFavorites();
  }
});
document.getElementById('favoritesGlobalBellBtn')?.addEventListener('click', () => {
  mobileFavGlobalInboxOpen = !mobileFavGlobalInboxOpen;
  renderMobileFavorites();
});
document.getElementById('favPrevPage')?.addEventListener('click', () => {
  if (mobileFavPage > 0) {
    mobileFavPage -= 1;
    mobileFavExpandedId = null;
    renderMobileFavorites();
  }
});
document.getElementById('favNextPage')?.addEventListener('click', () => {
  const totalPages = clampMobileFavPage();
  if (mobileFavPage < totalPages - 1) {
    mobileFavPage += 1;
    mobileFavExpandedId = null;
    renderMobileFavorites();
  }
});

const WATCH_LATER_CATEGORIES = [
  { id: 'music', icon: 'fas fa-music', i18n: 'watchLaterCatMusic', css: 'wl-cat-music' },
  { id: 'games', icon: 'fas fa-gamepad', i18n: 'watchLaterCatGames', css: 'wl-cat-games' },
  { id: 'sports', icon: 'fas fa-futbol', i18n: 'watchLaterCatSports', css: 'wl-cat-sports' },
  { id: 'business', icon: 'fas fa-briefcase', i18n: 'watchLaterCatBusiness', css: 'wl-cat-business' },
  { id: 'useful', icon: 'fas fa-lightbulb', i18n: 'watchLaterCatUseful', css: 'wl-cat-useful' },
  { id: 'funny', icon: 'fas fa-face-laugh', i18n: 'watchLaterCatFunny', css: 'wl-cat-funny' },
  { id: 'movies', icon: 'fas fa-film', i18n: 'watchLaterCatMovies', css: 'wl-cat-movies' },
  { id: 'podcast', icon: 'fas fa-podcast', i18n: 'watchLaterCatPodcast', css: 'wl-cat-podcast' },
  { id: 'stories', icon: 'fas fa-book-open', i18n: 'watchLaterCatStories', css: 'wl-cat-stories' },
  { id: 'books', icon: 'fas fa-book', i18n: 'watchLaterCatBooks', css: 'wl-cat-books' },
  { id: 'other', icon: 'fas fa-ellipsis', i18n: 'watchLaterCatOther', css: 'wl-cat-other' }
];

function getWatchLaterCategory(id) {
  return WATCH_LATER_CATEGORIES.find((c) => c.id === id) || WATCH_LATER_CATEGORIES[WATCH_LATER_CATEGORIES.length - 1];
}

function detectWatchLaterPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('youtube') || host === 'youtu.be') return 'YouTube';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('facebook') || host === 'fb.watch') return 'Facebook';
    if (host.includes('twitter') || host === 'x.com') return 'X';
    if (host.includes('twitch')) return 'Twitch';
    if (host.includes('kick.com')) return 'Kick';
    if (host.includes('vimeo')) return 'Vimeo';
    if (host.includes('dailymotion')) return 'Dailymotion';
    if (host.includes('soundcloud')) return 'SoundCloud';
    if (host.includes('spotify')) return 'Spotify';
    if (host.includes('reddit')) return 'Reddit';
    if (host.includes('rumble')) return 'Rumble';
    return host.split('.')[0] || 'Link';
  } catch {
    return 'Link';
  }
}

function guessWatchLaterTitle(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(?:shorts\/|video\/|@)?([^/?#]+)/);
    if (m?.[1] && m[1] !== 'watch') return decodeURIComponent(m[1]).replace(/[-_]+/g, ' ');
    return detectWatchLaterPlatform(url);
  } catch {
    return url;
  }
}

function normalizeMobileUrl(raw) {
  const cleaned = String(raw || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  const u = new URL(withProto);
  u.hash = '';
  let href = u.toString();
  if (href.endsWith('/') && u.pathname !== '/') href = href.slice(0, -1);
  return href;
}

function mobileUrlKey(url) {
  try {
    const u = new URL(normalizeMobileUrl(url));
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    u.protocol = 'https:';
    u.hash = '';
    return u.toString();
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

function loadMobileWatchLater() {
  try {
    const raw = JSON.parse(localStorage.getItem('vm_mobile_watchlater') || '[]');
    if (!Array.isArray(raw)) {
      mobileWatchLater = [];
      return;
    }
    mobileWatchLater = raw.filter((item) => item && item.url).map((item, i) => ({
      id: String(item.id || `wl_${Date.now()}_${i}`),
      url: String(item.url),
      title: String(item.title || guessWatchLaterTitle(item.url)),
      category: getWatchLaterCategory(item.category).id,
      platform: String(item.platform || detectWatchLaterPlatform(item.url)),
      channelUrl: String(item.channelUrl || ''),
      channelName: String(item.channelName || ''),
      addedAt: Number(item.addedAt) || Date.now()
    }));
  } catch {
    mobileWatchLater = [];
  }
}

function updateMobileWlBadge() {
  const badge = document.getElementById('mobileWlCount');
  if (!badge) return;
  const total = mobileWatchLater.length;
  badge.textContent = String(total);
  badge.classList.toggle('hidden', total === 0);
  badge.hidden = total === 0;
}

function saveMobileWatchLater() {
  localStorage.setItem('vm_mobile_watchlater', JSON.stringify(mobileWatchLater));
  updateMobileWlBadge();
}

function fillWatchLaterCategorySelect() {
  const select = document.getElementById('watchLaterCategorySelect');
  if (!select) return;
  const current = select.value || 'other';
  select.innerHTML = WATCH_LATER_CATEGORIES.map((cat) => (
    `<option value="${cat.id}">${escapeHtml(t(cat.i18n))}</option>`
  )).join('');
  select.value = WATCH_LATER_CATEGORIES.some((c) => c.id === current) ? current : 'other';
}

function renderWatchLaterFilters() {
  const wrap = document.getElementById('watchLaterFilters');
  if (!wrap) return;
  const buttons = [
    `<button type="button" class="wl-filter-btn${mobileWatchLaterFilter === 'all' ? ' active' : ''}" data-filter="all" title="${escapeHtml(t('watchLaterFilterAll'))}">
      <i class="fas fa-border-all"></i>
    </button>`
  ];
  WATCH_LATER_CATEGORIES.forEach((cat) => {
    buttons.push(`
      <button type="button" class="wl-filter-btn${mobileWatchLaterFilter === cat.id ? ' active' : ''}" data-filter="${cat.id}" title="${escapeHtml(t(cat.i18n))}">
        <i class="${cat.icon}"></i>
      </button>
    `);
  });
  wrap.innerHTML = buttons.join('');
  wrap.querySelectorAll('.wl-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mobileWatchLaterFilter = btn.dataset.filter || 'all';
      mobileWatchLaterPage = 0;
      renderWatchLaterFilters();
      renderMobileWatchLaterList();
    });
  });
}

function getMobileWlFiltered() {
  return mobileWatchLaterFilter === 'all'
    ? mobileWatchLater
    : mobileWatchLater.filter((item) => item.category === mobileWatchLaterFilter);
}

function clampMobileWlPage(total = getMobileWlFiltered().length) {
  const totalPages = Math.max(1, Math.ceil(total / MOBILE_WL_PAGE_SIZE) || 1);
  if (mobileWatchLaterPage >= totalPages) mobileWatchLaterPage = totalPages - 1;
  if (mobileWatchLaterPage < 0) mobileWatchLaterPage = 0;
  return totalPages;
}

function getMobileWlSlice() {
  const items = getMobileWlFiltered();
  const total = items.length;
  const totalPages = clampMobileWlPage(total);
  const start = mobileWatchLaterPage * MOBILE_WL_PAGE_SIZE;
  const end = Math.min(total, start + MOBILE_WL_PAGE_SIZE);
  return { start, end, total, totalPages, items: items.slice(start, end) };
}

function renderMobileWatchLaterList() {
  const list = document.getElementById('watchLaterList');
  const pager = document.getElementById('watchLaterPager');
  const rangeEl = document.getElementById('wlPageRange');
  const metaEl = document.getElementById('wlPageMeta');
  if (!list) return;
  fillWatchLaterCategorySelect();
  updateMobileWlBadge();

  const slice = getMobileWlSlice();

  if (!slice.total) {
    if (pager) pager.classList.add('hidden');
    if (metaEl) metaEl.textContent = '';
    list.innerHTML = `
      <div class="watchlater-empty">
        <i class="fas fa-clock"></i>
        <p>${escapeHtml(t('watchLaterEmpty'))}</p>
      </div>
    `;
    return;
  }

  if (pager) pager.classList.toggle('hidden', slice.total <= MOBILE_WL_PAGE_SIZE);
  if (rangeEl) rangeEl.textContent = `${slice.start + 1}–${slice.end}`;
  if (metaEl) {
    metaEl.textContent = `صفحة ${mobileWatchLaterPage + 1} / ${slice.totalPages} · ${slice.total} رابط`;
  }

  const maxPos = Math.max(slice.total, 1);
  list.innerHTML = slice.items.map((item, i) => {
    const position = slice.start + i + 1;
    const cat = getWatchLaterCategory(item.category);
    const channelLabel = item.channelName || (item.channelUrl ? guessMobileChannelName(item.channelUrl) : '');
    return `
      <div class="wl-item-card" data-id="${escapeHtml(item.id)}">
        <div class="wl-item-cat ${cat.css}" title="${escapeHtml(t(cat.i18n))}"><i class="${cat.icon}"></i></div>
        <label class="wl-position-wrap" title="${escapeHtml(t('watchLaterMoveTo'))}">
          <span>#</span>
          <input type="number" class="wl-position-input" data-id="${escapeHtml(item.id)}" value="${position}" min="1" max="${maxPos}" step="1" inputmode="numeric">
        </label>
        <div class="wl-item-info">
          <button type="button" class="wl-item-title" data-url="${escapeHtml(item.url)}" title="${escapeHtml(item.url)}">${escapeHtml(item.title)}</button>
          <div class="wl-item-meta">
            <span><i class="${cat.icon}"></i> ${escapeHtml(t(cat.i18n))}</span>
            <span>· ${escapeHtml(item.platform)}</span>
            ${item.channelUrl ? `
              <button type="button" class="wl-item-channel" data-channel-url="${escapeHtml(item.channelUrl)}" title="${escapeHtml(t('watchLaterOpenChannel'))}">
                <i class="fas fa-tv"></i> ${escapeHtml(channelLabel || t('watchLaterOpenChannel'))}
              </button>
            ` : ''}
          </div>
        </div>
        <div class="wl-item-actions">
          <button type="button" class="icon-btn ghost" data-url="${escapeHtml(item.url)}" data-action="copy" title="${escapeHtml(t('watchLaterCopy'))}"><i class="fas fa-copy"></i></button>
          <button type="button" class="icon-btn ghost" data-url="${escapeHtml(item.url)}" data-action="open" title="${escapeHtml(t('watchLaterOpening'))}"><i class="fas fa-external-link-alt"></i></button>
          <button type="button" class="icon-btn ghost" data-id="${escapeHtml(item.id)}" data-action="delete" title="${escapeHtml(t('watchLaterDelete'))}"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join('');

  bindMobileWatchLaterActions();
}

function renderMobileWatchLater() {
  renderWatchLaterFilters();
  renderMobileWatchLaterList();
}

function bindMobileWatchLaterActions() {
  const list = document.getElementById('watchLaterList');
  if (!list) return;

  list.querySelectorAll('.wl-item-title, [data-action="open"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (!url) return;
      window.open(url, '_blank', 'noopener');
      showMobileToast(t('watchLaterOpening'));
    });
  });
  list.querySelectorAll('.wl-item-channel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.channelUrl;
      if (!url) return;
      window.open(url, '_blank', 'noopener');
      showMobileToast(t('watchLaterOpening'));
    });
  });
  list.querySelectorAll('[data-action="copy"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        showMobileToast(t('watchLaterCopied'));
      } catch {
        showMobileToast(t('watchLaterCopyFailed'));
      }
    });
  });
  list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => removeMobileWatchLater(btn.dataset.id));
  });
  list.querySelectorAll('.wl-position-input').forEach((input) => {
    const apply = () => {
      const id = input.dataset.id;
      const visible = getMobileWlFiltered();
      const currentIndex = visible.findIndex((x) => x.id === id);
      if (currentIndex < 0) return;
      const maxPos = Math.max(visible.length, 1);
      let target = Number.parseInt(input.value, 10);
      if (!Number.isFinite(target)) {
        input.value = String(currentIndex + 1);
        return;
      }
      target = Math.min(Math.max(Math.round(target), 1), maxPos);
      input.value = String(target);
      if (target === currentIndex + 1) return;
      moveMobileWatchLaterVisiblePosition(id, target);
    };
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });
}

function moveMobileWatchLaterToPosition(id, position) {
  const fromIndex = mobileWatchLater.findIndex((x) => x.id === id);
  if (fromIndex < 0) return;
  const maxPos = Math.max(mobileWatchLater.length, 1);
  const toIndex = Math.min(Math.max(Math.round(Number(position) || 1), 1), maxPos) - 1;
  if (toIndex === fromIndex) return;
  const [item] = mobileWatchLater.splice(fromIndex, 1);
  mobileWatchLater.splice(toIndex, 0, item);
  mobileWatchLaterPage = Math.floor(toIndex / MOBILE_WL_PAGE_SIZE);
  saveMobileWatchLater();
  renderMobileWatchLaterList();
  showMobileToast(t('watchLaterMovedTo').replace('{position}', String(toIndex + 1)));
}

function moveMobileWatchLaterVisiblePosition(id, position) {
  const visible = getMobileWlFiltered();
  const from = visible.findIndex((x) => x.id === id);
  if (from < 0) return;
  const to = Math.min(Math.max(Math.round(Number(position) || 1), 1), visible.length) - 1;
  if (to === from) return;

  if (mobileWatchLaterFilter === 'all') {
    moveMobileWatchLaterToPosition(id, to + 1);
    return;
  }

  const ids = visible.map((x) => x.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  const byId = new Map(visible.map((x) => [x.id, x]));
  let i = 0;
  mobileWatchLater = mobileWatchLater.map((item) => (
    item.category === mobileWatchLaterFilter ? byId.get(ids[i++]) : item
  ));
  mobileWatchLaterPage = Math.floor(to / MOBILE_WL_PAGE_SIZE);
  saveMobileWatchLater();
  renderMobileWatchLaterList();
  showMobileToast(t('watchLaterMovedTo').replace('{position}', String(to + 1)));
}

window.removeMobileWatchLater = function (id) {
  mobileWatchLater = mobileWatchLater.filter((x) => x.id !== id);
  saveMobileWatchLater();
  renderMobileWatchLater();
  showMobileToast(t('watchLaterRemoved'));
};

function addMobileWatchLaterFromInputs() {
  const urlInput = document.getElementById('watchLaterUrlInput');
  const titleInput = document.getElementById('watchLaterTitleInput');
  const channelInput = document.getElementById('watchLaterChannelInput');
  const categorySelect = document.getElementById('watchLaterCategorySelect');
  const rawUrl = (urlInput?.value || '').trim();
  if (!rawUrl) {
    showMobileToast(t('errEnterUrl') || 'أدخل الرابط');
    return;
  }

  let url;
  try {
    url = normalizeMobileUrl(rawUrl);
  } catch {
    showMobileToast(t('errEnterUrl') || 'رابط غير صالح');
    return;
  }

  if (mobileWatchLater.some((x) => mobileUrlKey(x.url) === mobileUrlKey(url))) {
    showMobileToast(t('watchLaterExists'));
    return;
  }

  let channelUrl = '';
  let channelName = '';
  const rawChannel = (channelInput?.value || '').trim();
  if (rawChannel) {
    try {
      channelUrl = normalizeMobileUrl(rawChannel);
      channelName = guessMobileChannelName(channelUrl);
    } catch {
      channelUrl = '';
    }
  }

  const category = getWatchLaterCategory(categorySelect?.value || 'other').id;
  const title = (titleInput?.value || '').trim() || guessWatchLaterTitle(url);
  mobileWatchLater.unshift({
    id: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    title,
    category,
    platform: detectWatchLaterPlatform(url),
    channelUrl,
    channelName,
    addedAt: Date.now()
  });
  mobileWatchLaterPage = 0;
  saveMobileWatchLater();
  if (urlInput) urlInput.value = '';
  if (titleInput) titleInput.value = '';
  if (channelInput) channelInput.value = '';
  renderMobileWatchLater();
  showMobileToast(t('watchLaterAdded'));
}

loadMobileWatchLater();

document.getElementById('addWatchLaterBtn')?.addEventListener('click', () => {
  addMobileWatchLaterFromInputs();
});
document.getElementById('pasteWatchLaterBtn')?.addEventListener('click', async () => {
  const text = await getPastedText(t('watchLaterUrlPlaceholder'));
  const url = String(text || '').trim().match(/https?:\/\/[^\s]+/)?.[0];
  if (!url) return;
  const input = document.getElementById('watchLaterUrlInput');
  if (input) input.value = url;
});
document.getElementById('watchLaterUrlInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addMobileWatchLaterFromInputs();
  }
});
document.getElementById('wlPrevPage')?.addEventListener('click', () => {
  if (mobileWatchLaterPage > 0) {
    mobileWatchLaterPage -= 1;
    renderMobileWatchLaterList();
  }
});
document.getElementById('wlNextPage')?.addEventListener('click', () => {
  const totalPages = clampMobileWlPage();
  if (mobileWatchLaterPage < totalPages - 1) {
    mobileWatchLaterPage += 1;
    renderMobileWatchLaterList();
  }
});

updateHistoryUI();
populatePlatforms();
fetchSystemHealth();
saveMobileFavorites();
renderMobileFavorites();
renderMobileWatchLater();
updateDownloadButtonText();

(async () => {
  for (const ch of [...mobileFavorites]) {
    if (!ch.lastChecked) {
      await checkMobileFavoriteChannel(ch.id, { seedOnly: true });
    }
  }
})();
