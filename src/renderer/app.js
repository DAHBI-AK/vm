// State
let currentVideoInfo = null;
let selectedFormat = null;
let selectedType = null;
let selectedHeight = 'best';
let selectedHasAudio = true;
let downloadHistory = [];
let appReady = false;
let studioMode = 'full';
let videoDuration = 0;
let clipStart = 0;
let clipEnd = 30;
let imageMode = 'thumbnail';
let imageFormat = 'png';
let frameTime = 0;
let thumbZoomScale = 1;
let frameZoomScale = 1;
let cropPositionPercent = { x: 20, y: 20 };
let maskShape = 'rect';

function updateMaskShapeUI() {
  const thumbCrop = document.getElementById('thumbCropFrame');
  const frameCrop = document.getElementById('frameCropFrame');
  let radius = '4px';
  if (maskShape === 'circle') radius = '50%';
  else if (maskShape === 'rounded') radius = '18px';

  [thumbCrop, frameCrop].forEach((el) => {
    if (el) el.style.borderRadius = radius;
  });
}

function applyAspectToPreviewScreens() {
  const thumbnailImg = document.getElementById('thumbnailPreviewImg');
  const frameImg = document.getElementById('framePreviewImg');
  const framePlayer = document.getElementById('frameVideoPlayer');
  const thumbContainer = document.getElementById('thumbImgContainer');
  const frameContainer = document.getElementById('frameImgContainer');
  const aspectBadge = document.getElementById('aspectBadge');
  const customInputs = document.getElementById('customAspectInputs');
  const thumbCrop = document.getElementById('thumbCropFrame');
  const frameCrop = document.getElementById('frameCropFrame');

  if (customInputs) {
    customInputs.style.display = imageAspect === 'custom' ? 'flex' : 'none';
  }

  let aspectStyle = '16 / 9';
  let aspectLabel = '📐 افتراضي (16:9)';
  let containerMaxWidth = '100%';
  let containerMaxHeight = '280px';

  if (imageAspect === '1:1') {
    aspectStyle = '1 / 1';
    aspectLabel = '📐 مربع (1:1)';
    containerMaxWidth = '250px';
    containerMaxHeight = '250px';
  } else if (imageAspect === '9:16') {
    aspectStyle = '9 / 16';
    aspectLabel = '📐 جوال / ريلز (9:16)';
    containerMaxWidth = '190px';
    containerMaxHeight = '320px';
  } else if (imageAspect === '4:5') {
    aspectStyle = '4 / 5';
    aspectLabel = '📐 انستغرام (4:5)';
    containerMaxWidth = '230px';
    containerMaxHeight = '285px';
  } else if (imageAspect === '21:9') {
    aspectStyle = '21 / 9';
    aspectLabel = '📐 سينمائي (21:9)';
    containerMaxWidth = '100%';
    containerMaxHeight = '200px';
  } else if (imageAspect === 'custom') {
    const w = parseInt(document.getElementById('customAspectWidth')?.value) || 1080;
    const h = parseInt(document.getElementById('customAspectHeight')?.value) || 1080;
    aspectStyle = `${w} / ${h}`;
    aspectLabel = `📐 مخصص (${w}×${h} px)`;
    containerMaxWidth = w >= h ? '100%' : '230px';
    containerMaxHeight = w >= h ? '260px' : '320px';
  }

  if (aspectBadge) {
    aspectBadge.textContent = aspectLabel;
  }

  [thumbContainer, frameContainer].forEach((cont) => {
    if (cont) {
      cont.style.maxWidth = containerMaxWidth;
      cont.style.maxHeight = containerMaxHeight;
      cont.style.margin = '0 auto';
      cont.style.aspectRatio = imageAspect === 'default' ? '' : aspectStyle;
    }
  });

  [thumbnailImg, frameImg, framePlayer].forEach((el) => {
    if (el) {
      if (imageAspect === 'default') {
        el.style.aspectRatio = '';
        el.style.objectFit = 'contain';
      } else {
        el.style.aspectRatio = aspectStyle;
        el.style.objectFit = 'cover';
      }
    }
  });

  const showCrop = imageAspect !== 'default';
  if (thumbCrop) thumbCrop.style.display = showCrop ? 'block' : 'none';
  if (frameCrop) frameCrop.style.display = showCrop ? 'block' : 'none';

  if (showCrop) {
    bindCropDraggable(thumbCrop, thumbContainer);
    bindCropDraggable(frameCrop, frameContainer);
  }
  updateMaskShapeUI();
}

function bindCropDraggable(cropFrameEl, containerEl) {
  if (!cropFrameEl || !containerEl || cropFrameEl.dataset.dragBound) return;
  cropFrameEl.dataset.dragBound = 'true';

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  cropFrameEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = cropFrameEl.offsetLeft;
    initialTop = cropFrameEl.offsetTop;
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const maxLeft = Math.max(0, containerEl.clientWidth - cropFrameEl.clientWidth);
    const maxTop = Math.max(0, containerEl.clientHeight - cropFrameEl.clientHeight);

    const newLeft = Math.max(0, Math.min(initialLeft + dx, maxLeft));
    const newTop = Math.max(0, Math.min(initialTop + dy, maxTop));

    cropFrameEl.style.left = `${newLeft}px`;
    cropFrameEl.style.top = `${newTop}px`;

    cropPositionPercent.x = maxLeft > 0 ? (newLeft / maxLeft) * 100 : 0;
    cropPositionPercent.y = maxTop > 0 ? (newTop / maxTop) * 100 : 0;
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });
}

function openImageFullscreenModal(imgSrc, title = 'معاينة بحجم الشاشة الكاملة') {
  const modal = document.getElementById('imageFullscreenModal');
  const modalImg = document.getElementById('fullscreenModalImg');
  const modalTitle = document.getElementById('modalImageTitle');
  if (modal && modalImg) {
    modalImg.src = imgSrc;
    if (modalTitle) modalTitle.textContent = title;
    modal.style.display = 'flex';
  }
}

function closeImageFullscreenModal() {
  const modal = document.getElementById('imageFullscreenModal');
  if (modal) modal.style.display = 'none';
}
let timelineRaf = null;
const clientInfoCache = new Map();
let storedFormats = null;
let downloadType = 'video-audio';
let currentSection = 'downloader';

let downloadQueue = [];
let isQueueProcessing = false;

const DEFAULT_DOWNLOAD_PATH_KEY = 'defaultDownloadPath';
const CLIPBOARD_WATCH_KEY = 'clipboardAutoDetect';
const NOTIFICATIONS_KEY = 'notificationsEnabled';
let pendingClipboardUrl = '';

function t(key) {
  return window.i18n?.t?.(key) || key;
}

function isTurboEnabled() {
  return localStorage.getItem('turboMode') !== 'false';
}

function isAudioEnhanceEnabled() {
  return localStorage.getItem('audioEnhanceEnabled') !== 'false';
}

function isClipboardWatchEnabled() {
  return localStorage.getItem(CLIPBOARD_WATCH_KEY) !== 'false';
}

function isNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATIONS_KEY) !== 'false';
}

function scheduleTimelineUpdate() {
  if (timelineRaf) {
    return;
  }

  timelineRaf = requestAnimationFrame(() => {
    timelineRaf = null;
    updateTimelineUI();
  });
}

// DOM Elements
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
  statusBar: document.getElementById('statusBar'),
  
  // Video info elements
  thumbnailImg: document.getElementById('thumbnailImg'),
  durationBadge: document.getElementById('durationBadge'),
  videoTitle: document.getElementById('videoTitle'),
  videoUploader: document.getElementById('videoUploader'),
  videoDescription: document.getElementById('videoDescription'),
  
  // Unified quality
  unifiedQualityPanel: document.getElementById('unifiedQualityPanel'),
  unifiedQualityGrid: document.getElementById('unifiedQualityGrid'),
  downloadTypeTabs: document.getElementById('downloadTypeTabs'),
  qualityHint: document.getElementById('qualityHint'),
  downloadTypeTabButtons: document.querySelectorAll('.download-type-tab'),
  
  // Download
  filenameInput: document.getElementById('filenameInput'),
  downloadBtn: document.getElementById('downloadBtn'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  progressInfo: document.getElementById('progressInfo'),
  successPath: document.getElementById('successPath'),
  newDownloadBtn: document.getElementById('newDownloadBtn'),
  chooseDownloadFolderBtn: document.getElementById('chooseDownloadFolderBtn'),
  openLastDownloadSidebarBtn: document.getElementById('openLastDownloadSidebarBtn'),
  
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  sections: document.querySelectorAll('.section'),
  pageTitle: document.getElementById('pageTitle'),
  platformsGrid: document.getElementById('platformsGrid'),
  historyList: document.getElementById('historyList'),

  studioPanel: document.getElementById('studioPanel'),
  studioTabs: document.querySelectorAll('.studio-tab'),
  clipWorkspace: document.getElementById('clipWorkspace'),
  imageWorkspace: document.getElementById('imageWorkspace'),
  videoDurationLabel: document.getElementById('videoDurationLabel'),
  clipLengthLabel: document.getElementById('clipLengthLabel'),
  clipRangeLabel: document.getElementById('clipRangeLabel'),
  timelineRuler: document.getElementById('timelineRuler'),
  timelineSelection: document.getElementById('timelineSelection'),
  clipStartRange: document.getElementById('clipStartRange'),
  clipEndRange: document.getElementById('clipEndRange'),
  clipStartTime: document.getElementById('clipStartTime'),
  clipEndTime: document.getElementById('clipEndTime'),
  frameControls: document.getElementById('frameControls'),
  framePreviewImg: document.getElementById('framePreviewImg'),
  frameTimeBadge: document.getElementById('frameTimeBadge'),
  frameTimeRange: document.getElementById('frameTimeRange'),
  frameTimeInput: document.getElementById('frameTimeInput'),
  imageModeCards: document.querySelectorAll('.image-mode-card'),
  imageFormatPills: document.querySelectorAll('.format-pill'),
  presetButtons: document.querySelectorAll('.preset-btn'),
  downloadBtnText: document.getElementById('downloadBtnText'),
  batchToggleBtn: document.getElementById('batchToggleBtn'),
  batchQueuePanel: document.getElementById('batchQueuePanel'),
  closeBatchBtn: document.getElementById('closeBatchBtn'),
  batchUrlsText: document.getElementById('batchUrlsText'),
  pasteAddBatchBtn: document.getElementById('pasteAddBatchBtn'),
  addBatchBtn: document.getElementById('addBatchBtn'),
  startBatchBtn: document.getElementById('startBatchBtn'),
  clearBatchBtn: document.getElementById('clearBatchBtn'),
  batchQueueList: document.getElementById('batchQueueList'),
  playPreviewBtn: document.getElementById('playPreviewBtn'),
  previewPlayerBox: document.getElementById('previewPlayerBox'),
  previewActiveBadge: document.getElementById('previewActiveBadge'),
  refreshPreviewBtn: document.getElementById('refreshPreviewBtn'),
  closePreviewBtn: document.getElementById('closePreviewBtn'),
  previewVideoEl: document.getElementById('previewVideoEl'),
  statusMessage: document.getElementById('statusMessage'),
  defaultPathInput: document.getElementById('defaultPath'),
  browsePathBtn: document.getElementById('browsePathBtn'),
  clipboardPrompt: document.getElementById('clipboardPrompt'),
  clipboardPromptUrl: document.getElementById('clipboardPromptUrl'),
  clipboardAcceptBtn: document.getElementById('clipboardAcceptBtn'),
  clipboardDismissBtn: document.getElementById('clipboardDismissBtn'),
  appSplash: document.getElementById('appSplash'),
  systemStatusBadge: document.getElementById('systemStatusBadge'),
  repairBanner: document.getElementById('repairBanner'),
  repairBtn: document.getElementById('repairBtn'),
  repairSettingsBtn: document.getElementById('repairSettingsBtn'),
  welcomePanel: document.getElementById('welcomePanel'),
  healthYtDlp: document.getElementById('healthYtDlp'),
  healthFfmpeg: document.getElementById('healthFfmpeg'),
  circularProgressWidget: document.getElementById('circularProgressWidget'),
  progressRingCircle: document.getElementById('progressRingCircle'),
  circularPercentText: document.getElementById('circularPercentText'),
  quickPlayBtn: document.getElementById('quickPlayBtn'),
  settingsPasteBtn: document.getElementById('settingsPasteBtn'),
  settingsDownloadBtn: document.getElementById('settingsDownloadBtn'),
  settingsQuickPlayBtn: document.getElementById('settingsQuickPlayBtn')
};

let lastDownloadedPath = null;

function hideAppSplash() {
  if (!elements.appSplash || elements.appSplash.classList.contains('hide')) {
    return;
  }

  elements.appSplash.classList.add('hide');
  window.setTimeout(() => {
    elements.appSplash?.remove();
  }, 500);
}

// Format duration
function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hours = Math.floor(mins / 60);
  
  if (hours > 0) {
    return `${hours}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Format file size
function formatSize(bytes) {
  if (!bytes) return t('unknownSize');
  const sizes = [t('byte'), t('kilobyte'), t('megabyte'), t('gigabyte')];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getStoredDownloadPath() {
  return localStorage.getItem(DEFAULT_DOWNLOAD_PATH_KEY) || '';
}

function getVideoQualityTiers() {
  return [
    { key: 'low', label: t('tierLow'), min: 0, max: 360 },
    { key: 'medium', label: t('tierMedium'), min: 361, max: 720 },
    { key: 'high', label: t('tierHigh'), min: 721, max: Infinity }
  ];
}

function getAudioQualityTiers() {
  return [
    { key: 'low', label: t('tierLow'), max: 127 },
    { key: 'medium', label: t('tierMedium'), min: 128, max: 192 },
    { key: 'high', label: t('tierHigh'), min: 193, max: Infinity }
  ];
}

// Clean filename
function cleanFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

function parseTimecode(value) {
  const parts = String(value || '').trim().split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  return parts[0] || 0;
}

function formatTimecode(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatShortTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function clampClipRange() {
  const maxDuration = Math.max(1, videoDuration || 1);
  clipStart = Math.max(0, Math.min(clipStart, maxDuration - 1));
  clipEnd = Math.max(clipStart + 1, Math.min(clipEnd, maxDuration));
}

let clipStreamLoading = false;
let activeCutHandle = 'start';
let imageAspect = 'default';

function applyAspectToPreviewScreens() {
  const thumbnailImg = document.getElementById('thumbnailPreviewImg');
  const frameImg = document.getElementById('framePreviewImg');
  const framePlayer = document.getElementById('frameVideoPlayer');
  const aspectBadge = document.getElementById('aspectBadge');
  const customInputs = document.getElementById('customAspectInputs');

  if (customInputs) {
    customInputs.style.display = imageAspect === 'custom' ? 'flex' : 'none';
  }

  let aspectStyle = 'auto';
  let aspectLabel = '📐 افتراضي (16:9)';

  if (imageAspect === '1:1') {
    aspectStyle = '1 / 1';
    aspectLabel = '📐 مربع (1:1)';
  } else if (imageAspect === '9:16') {
    aspectStyle = '9 / 16';
    aspectLabel = '📐 جوال / ريلز (9:16)';
  } else if (imageAspect === '4:5') {
    aspectStyle = '4 / 5';
    aspectLabel = '📐 انستغرام (4:5)';
  } else if (imageAspect === '21:9') {
    aspectStyle = '21 / 9';
    aspectLabel = '📐 سينمائي (21:9)';
  } else if (imageAspect === 'custom') {
    const w = parseInt(document.getElementById('customAspectWidth')?.value) || 1080;
    const h = parseInt(document.getElementById('customAspectHeight')?.value) || 1080;
    aspectStyle = `${w} / ${h}`;
    aspectLabel = `📐 مخصص (${w}×${h} px)`;
  }

  if (aspectBadge) {
    aspectBadge.textContent = aspectLabel;
  }

  [thumbnailImg, frameImg, framePlayer].forEach((el) => {
    if (el) {
      if (imageAspect === 'default') {
        el.style.aspectRatio = '';
        el.style.objectFit = 'contain';
      } else {
        el.style.aspectRatio = aspectStyle;
        el.style.objectFit = 'cover';
      }
    }
  });
}

function ensureClipPlayerStream() {
  const player = document.getElementById('clipVideoPlayer');
  if (!player || player.src || clipStreamLoading || !currentVideoInfo) return;

  const url = elements.videoUrl?.value?.trim();
  if (!url || !window.electronAPI?.getStreamUrl) return;

  clipStreamLoading = true;
  window.electronAPI.getStreamUrl({ url, options: { mode: 'clip' } }).then((res) => {
    clipStreamLoading = false;
    if (res?.success && res.url) {
      player.src = res.url;
      player.style.display = 'block';
      const frameImg = document.getElementById('clipFrameImg');
      const placeholder = document.getElementById('clipPlayerPlaceholder');
      if (frameImg) frameImg.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';
      try {
        player.pause();
        player.currentTime = (activeCutHandle === 'end' ? clipEnd : clipStart) || 0;
      } catch (e) {}
    }
  }).catch(() => {
    clipStreamLoading = false;
  });
}

function syncClipFramePreview(timeSeconds, labelText = '') {
  const player = document.getElementById('clipVideoPlayer');
  const badge = document.getElementById('clipCurrentFrameBadge');
  const overlayBadge = document.getElementById('clipFrameBadgeOverlay');
  const placeholder = document.getElementById('clipPlayerPlaceholder');
  const frameImg = document.getElementById('clipFrameImg');

  const validTime = Math.max(0, Math.min(Number(timeSeconds) || 0, videoDuration || Number(timeSeconds) || 0));
  const formattedTime = formatTimecode(validTime);

  if (badge) {
    badge.textContent = `${formattedTime} ${labelText ? '(' + labelText + ')' : ''}`;
  }

  if (overlayBadge) {
    overlayBadge.style.display = 'block';
    overlayBadge.innerHTML = `<i class="fas fa-eye" style="color:#34d399;"></i> ${labelText ? labelText + ': ' : ''}${formattedTime}`;
  }

  ensureClipPlayerStream();

  if (player) {
    if (placeholder) placeholder.style.display = 'none';

    if (player.src) {
      player.style.display = 'block';
      if (frameImg) frameImg.style.display = 'none';
      try {
        player.pause();
        player.currentTime = validTime;
      } catch (e) {}
    } else if (currentVideoInfo?.thumbnail && frameImg) {
      frameImg.src = currentVideoInfo.thumbnail;
      frameImg.style.display = 'block';
      player.style.display = 'none';
    }
  }
}

function updateImageWorkspaceUI() {
  const thumbnailBox = document.getElementById('thumbnailPreviewBox');
  const thumbnailImg = document.getElementById('thumbnailPreviewImg');
  const frameControls = document.getElementById('frameControls');

  if (imageMode === 'thumbnail') {
    if (thumbnailBox) thumbnailBox.style.display = 'block';
    if (frameControls) frameControls.style.display = 'none';
    if (thumbnailImg && currentVideoInfo?.thumbnail) {
      thumbnailImg.src = currentVideoInfo.thumbnailUrl || currentVideoInfo.thumbnail;
    }
  } else {
    if (thumbnailBox) thumbnailBox.style.display = 'none';
    if (frameControls) frameControls.style.display = 'block';
    ensureClipPlayerStream();
    syncFrameCapturePreview(frameTime);
  }
}

function syncFrameCapturePreview(seconds) {
  const timeSec = Math.max(0, Math.min(Number(seconds) || 0, videoDuration || Number(seconds) || 0));
  const frameVideoPlayer = document.getElementById('frameVideoPlayer');
  const clipVideoPlayer = document.getElementById('clipVideoPlayer');
  const framePreviewImg = document.getElementById('framePreviewImg');
  const frameTimeBadge = document.getElementById('frameTimeBadge');

  if (frameTimeBadge) {
    frameTimeBadge.textContent = formatTimecode(timeSec);
  }

  ensureClipPlayerStream();

  const activePlayer = frameVideoPlayer?.src ? frameVideoPlayer : (clipVideoPlayer?.src ? clipVideoPlayer : null);
  if (activePlayer && activePlayer.src) {
    if (frameVideoPlayer) {
      frameVideoPlayer.src = activePlayer.src;
      frameVideoPlayer.style.display = 'block';
    }
    if (framePreviewImg) framePreviewImg.style.display = 'none';
    try {
      if (frameVideoPlayer) {
        frameVideoPlayer.pause();
        frameVideoPlayer.currentTime = timeSec;
      }
    } catch (e) {}
  } else if (currentVideoInfo?.thumbnail && framePreviewImg) {
    framePreviewImg.src = currentVideoInfo.thumbnail;
    framePreviewImg.style.display = 'block';
    if (frameVideoPlayer) frameVideoPlayer.style.display = 'none';
  }
}

function updateTimelineUI() {
  if (!videoDuration) {
    return;
  }

  clampClipRange();

  const startPct = (clipStart / videoDuration) * 100;
  const endPct = (clipEnd / videoDuration) * 100;

  elements.timelineSelection.style.left = `${startPct}%`;
  elements.timelineSelection.style.width = `${Math.max(0.5, endPct - startPct)}%`;
  elements.clipStartRange.value = startPct;
  elements.clipEndRange.value = endPct;
  elements.clipStartTime.value = formatTimecode(clipStart);
  elements.clipEndTime.value = formatTimecode(clipEnd);
  elements.clipLengthLabel.textContent = formatShortTime(clipEnd - clipStart);
  elements.clipRangeLabel.textContent = `${formatShortTime(clipStart)} → ${formatShortTime(clipEnd)}`;
  elements.videoDurationLabel.textContent = formatTimecode(videoDuration);

  if (activeCutHandle === 'end') {
    syncClipFramePreview(clipEnd, 'فريم نهاية القص');
  } else {
    syncClipFramePreview(clipStart, 'فريم بداية القص');
  }
}

function buildTimelineRuler() {
  if (!videoDuration) {
    elements.timelineRuler.innerHTML = '';
    return;
  }

  const marks = 6;
  elements.timelineRuler.innerHTML = Array.from({ length: marks + 1 }, (_, index) => {
    const time = (videoDuration / marks) * index;
    return `<span>${formatShortTime(time)}</span>`;
  }).join('');
}

function initStudioTimeline() {
  videoDuration = currentVideoInfo?.duration || 0;
  clipStart = 0;
  clipEnd = Math.min(30, videoDuration || 30);

  if (videoDuration > 0 && clipEnd <= clipStart) {
    clipEnd = Math.min(videoDuration, clipStart + 1);
  }

  frameTime = 0;
  elements.frameTimeRange.max = videoDuration || 100;
  elements.frameTimeRange.value = 0;
  elements.frameTimeInput.value = formatTimecode(0);
  buildTimelineRuler();
  updateTimelineUI();
  syncClipFramePreview(clipStart, 'فريم البداية');
}

function updateDownloadButtonText() {
  if (studioMode === 'clip') {
    elements.downloadBtnText.textContent = t('exportClip');
  } else if (studioMode === 'image') {
    elements.downloadBtnText.textContent = imageMode === 'thumbnail' ? t('downloadThumbnail') : t('extractFrame');
  } else {
    elements.downloadBtnText.textContent = t('download');
  }
}

function setStudioMode(mode) {
  studioMode = mode;

  elements.studioTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  elements.clipWorkspace.classList.toggle('active', mode === 'clip');
  elements.imageWorkspace.classList.toggle('active', mode === 'image');
  elements.unifiedQualityPanel.classList.toggle('hidden', mode === 'image');
  elements.downloadTypeTabs.classList.toggle('hidden', mode === 'clip');

  if (mode === 'image') {
    updateImageWorkspaceUI();
  } else {
    refreshUnifiedQualityGrid();
  }

  updateQualityHint();
  updateDownloadButtonText();
}

function updateQualityHint() {
  if (studioMode === 'clip') {
    elements.qualityHint.textContent = t('qualityHintClip');
    return;
  }

  const hints = {
    'video-audio': t('qualityHintVideoAudio'),
    'video-only': t('qualityHintVideoOnly'),
    audio: t('qualityHintAudio')
  };
  elements.qualityHint.textContent = hints[downloadType] || hints['video-audio'];
}

function getActiveDownloadType() {
  if (studioMode === 'clip') {
    return document.querySelector('input[name="clipAudioMode"]:checked')?.value || 'video-audio';
  }
  return downloadType;
}

function setDownloadType(type) {
  downloadType = type;
  elements.downloadTypeTabButtons.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.type === type);
  });
  updateQualityHint();
  refreshUnifiedQualityGrid(true);
}

function refreshUnifiedQualityGrid(keepSelection = false) {
  if (!storedFormats || !elements.unifiedQualityGrid) {
    return;
  }

  const previousHeight = selectedHeight;
  const previousFormat = selectedFormat;
  const type = getActiveDownloadType();

  elements.unifiedQualityGrid.innerHTML = '';

  if (type === 'audio') {
    populateAudioGrid(storedFormats.audio || [], elements.unifiedQualityGrid);
    selectedType = 'audio';
    selectedHasAudio = true;
  } else {
    const label = type === 'video-only' ? t('mp4NoAudio') : t('mp4WithAudio');
    populateVideoGrid(elements.unifiedQualityGrid, type, storedFormats.videoWithAudio || [], label);
    selectedType = type;
    selectedHasAudio = type === 'video-audio';
  }

  if (keepSelection && previousFormat) {
    const match = elements.unifiedQualityGrid.querySelector(`[data-format-id="${previousFormat}"]`);
    if (match) {
      match.click();
      return;
    }
    if (previousHeight) {
      const heightMatch = [...elements.unifiedQualityGrid.querySelectorAll('.quality-option')]
        .find((card) => card.querySelector('.quality-label')?.textContent === `${previousHeight}p`);
      if (heightMatch) {
        heightMatch.click();
      }
    }
  }
}

function applyClipPreset(preset) {
  if (!videoDuration) return;

  switch (preset) {
    case 'intro':
      clipStart = 0;
      clipEnd = Math.min(30, videoDuration);
      break;
    case 'minute':
      clipStart = 0;
      clipEnd = Math.min(60, videoDuration);
      break;
    case 'middle': {
      const middle = Math.floor(videoDuration / 2);
      clipStart = Math.max(0, middle - 15);
      clipEnd = Math.min(videoDuration, middle + 15);
      break;
    }
    case 'last30':
      clipStart = Math.max(0, videoDuration - 30);
      clipEnd = videoDuration;
      break;
    default:
      break;
  }

  updateTimelineUI();
}

function bindStudioEvents() {
  elements.studioTabs.forEach((tab) => {
    tab.addEventListener('click', () => setStudioMode(tab.dataset.mode));
  });

  elements.clipStartRange.addEventListener('input', () => {
    activeCutHandle = 'start';
    const maxDuration = videoDuration || 1;
    clipStart = (Number(elements.clipStartRange.value) / 100) * maxDuration;
    if (clipStart >= clipEnd - 1) {
      clipStart = Math.max(0, clipEnd - 1);
    }
    scheduleTimelineUpdate();
    syncClipFramePreview(clipStart, 'فريم بداية القص');
  });

  elements.clipEndRange.addEventListener('input', () => {
    activeCutHandle = 'end';
    const maxDuration = videoDuration || 1;
    clipEnd = (Number(elements.clipEndRange.value) / 100) * maxDuration;
    if (clipEnd <= clipStart + 1) {
      clipEnd = Math.min(maxDuration, clipStart + 1);
    }
    scheduleTimelineUpdate();
    syncClipFramePreview(clipEnd, 'فريم نهاية القص');
  });

  elements.clipStartTime.addEventListener('change', () => {
    activeCutHandle = 'start';
    clipStart = parseTimecode(elements.clipStartTime.value);
    updateTimelineUI();
    syncClipFramePreview(clipStart, 'فريم بداية القص');
  });

  elements.clipEndTime.addEventListener('change', () => {
    activeCutHandle = 'end';
    clipEnd = parseTimecode(elements.clipEndTime.value);
    updateTimelineUI();
    syncClipFramePreview(clipEnd, 'فريم نهاية القص');
  });

  const timelineTrackEl = document.getElementById('timelineTrack');
  if (timelineTrackEl && !timelineTrackEl.dataset.bound) {
    timelineTrackEl.dataset.bound = 'true';
    timelineTrackEl.addEventListener('click', (e) => {
      if (!videoDuration) return;
      const rect = timelineTrackEl.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const clickedTime = pct * videoDuration;
      syncClipFramePreview(clickedTime, 'الفريم المختار');
    });
  }

  const clipPreviewStartBtn = document.getElementById('clipPreviewStartBtn');
  const clipPreviewEndBtn = document.getElementById('clipPreviewEndBtn');
  const clipPlayTrimmedBtn = document.getElementById('clipPlayTrimmedBtn');

  if (clipPreviewStartBtn && !clipPreviewStartBtn.dataset.bound) {
    clipPreviewStartBtn.dataset.bound = 'true';
    clipPreviewStartBtn.addEventListener('click', () => {
      activeCutHandle = 'start';
      syncClipFramePreview(clipStart, 'فريم بداية القص');
    });
  }

  if (clipPreviewEndBtn && !clipPreviewEndBtn.dataset.bound) {
    clipPreviewEndBtn.dataset.bound = 'true';
    clipPreviewEndBtn.addEventListener('click', () => {
      activeCutHandle = 'end';
      syncClipFramePreview(clipEnd, 'فريم نهاية القص');
    });
  }

  if (clipPlayTrimmedBtn && !clipPlayTrimmedBtn.dataset.bound) {
    clipPlayTrimmedBtn.dataset.bound = 'true';
    clipPlayTrimmedBtn.addEventListener('click', () => {
      const player = document.getElementById('clipVideoPlayer');
      if (player) {
        player.currentTime = clipStart;
        player.play().catch(() => {});
        const onTimeUpdate = () => {
          if (player.currentTime >= clipEnd) {
            player.pause();
            player.removeEventListener('timeupdate', onTimeUpdate);
          }
        };
        player.addEventListener('timeupdate', onTimeUpdate);
      }
    });
  }

  document.querySelectorAll('input[name="clipAudioMode"]').forEach((input) => {
    input.addEventListener('change', () => refreshUnifiedQualityGrid(true));
  });

  elements.downloadTypeTabButtons.forEach((tab) => {
    tab.addEventListener('click', () => setDownloadType(tab.dataset.type));
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      elements.presetButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      applyClipPreset(button.dataset.preset);
    });
  });

  elements.imageModeCards.forEach((card) => {
    card.addEventListener('click', () => {
      imageMode = card.dataset.imageMode;
      elements.imageModeCards.forEach((item) => item.classList.remove('active'));
      card.classList.add('active');
      updateImageWorkspaceUI();
      updateDownloadButtonText();
    });
  });

  elements.frameTimeRange.addEventListener('input', () => {
    frameTime = Number(elements.frameTimeRange.value) || 0;
    elements.frameTimeInput.value = formatTimecode(frameTime);
    elements.frameTimeBadge.textContent = formatTimecode(frameTime);
    syncFrameCapturePreview(frameTime);
  }, { passive: true });

  elements.frameTimeInput.addEventListener('change', () => {
    frameTime = parseTimecode(elements.frameTimeInput.value);
    frameTime = Math.max(0, Math.min(frameTime, videoDuration || frameTime));
    elements.frameTimeRange.value = frameTime;
    elements.frameTimeInput.value = formatTimecode(frameTime);
    elements.frameTimeBadge.textContent = formatTimecode(frameTime);
    syncFrameCapturePreview(frameTime);
  });

  elements.imageFormatPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      imageFormat = pill.dataset.format;
      elements.imageFormatPills.forEach((item) => item.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Zoom & Fullscreen Toolbar Listeners
  const thumbImgEl = document.getElementById('thumbnailPreviewImg');
  const frameImgEl = document.getElementById('framePreviewImg');
  const framePlayerEl = document.getElementById('frameVideoPlayer');

  document.getElementById('thumbZoomInBtn')?.addEventListener('click', () => {
    thumbZoomScale = Math.min(3, thumbZoomScale + 0.25);
    if (thumbImgEl) thumbImgEl.style.transform = `scale(${thumbZoomScale})`;
  });

  document.getElementById('thumbZoomOutBtn')?.addEventListener('click', () => {
    thumbZoomScale = Math.max(0.5, thumbZoomScale - 0.25);
    if (thumbImgEl) thumbImgEl.style.transform = `scale(${thumbZoomScale})`;
  });

  document.getElementById('thumbZoomResetBtn')?.addEventListener('click', () => {
    thumbZoomScale = 1;
    if (thumbImgEl) thumbImgEl.style.transform = 'scale(1)';
  });

  document.getElementById('thumbFullscreenBtn')?.addEventListener('click', () => {
    if (thumbImgEl?.src) {
      openImageFullscreenModal(thumbImgEl.src, 'معاينة غلاف الفيديو - شاشة كاملة');
    }
  });

  document.getElementById('frameZoomInBtn')?.addEventListener('click', () => {
    frameZoomScale = Math.min(3, frameZoomScale + 0.25);
    if (frameImgEl) frameImgEl.style.transform = `scale(${frameZoomScale})`;
    if (framePlayerEl) framePlayerEl.style.transform = `scale(${frameZoomScale})`;
  });

  document.getElementById('frameZoomOutBtn')?.addEventListener('click', () => {
    frameZoomScale = Math.max(0.5, frameZoomScale - 0.25);
    if (frameImgEl) frameImgEl.style.transform = `scale(${frameZoomScale})`;
    if (framePlayerEl) framePlayerEl.style.transform = `scale(${frameZoomScale})`;
  });

  document.getElementById('frameZoomResetBtn')?.addEventListener('click', () => {
    frameZoomScale = 1;
    if (frameImgEl) frameImgEl.style.transform = 'scale(1)';
    if (framePlayerEl) framePlayerEl.style.transform = 'scale(1)';
  });

  document.getElementById('frameFullscreenBtn')?.addEventListener('click', () => {
    if (frameImgEl?.src && frameImgEl.style.display !== 'none') {
      openImageFullscreenModal(frameImgEl.src, `معاينة لقطة الفريم - شاشة كاملة`);
    } else if (currentVideoInfo?.thumbnail) {
      openImageFullscreenModal(currentVideoInfo.thumbnail, 'معاينة اللقطة - شاشة كاملة');
    }
  });

  document.getElementById('closeFullscreenModalBtn')?.addEventListener('click', closeImageFullscreenModal);
  document.getElementById('imageFullscreenModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'imageFullscreenModal') closeImageFullscreenModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageFullscreenModal();
  });

  document.querySelectorAll('.aspect-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      imageAspect = pill.dataset.aspect;
      document.querySelectorAll('.aspect-pill').forEach((item) => item.classList.remove('active'));
      pill.classList.add('active');
      applyAspectToPreviewScreens();
    });
  });

  document.querySelectorAll('.mask-shape-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      maskShape = pill.dataset.shape;
      document.querySelectorAll('.mask-shape-pill').forEach((item) => item.classList.remove('active'));
      pill.classList.add('active');
      updateMaskShapeUI();
    });
  });

  ['customAspectWidth', 'customAspectHeight'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (imageAspect === 'custom') {
          applyAspectToPreviewScreens();
        }
      });
    }
  });

  
  }

// Show status
function hideClipboardPrompt() {
  pendingClipboardUrl = '';
  elements.clipboardPrompt?.classList.remove('show');
}

function showClipboardPrompt(url) {
  if (!elements.clipboardPrompt || !url) {
    return;
  }

  const currentUrl = normalizeInputUrl(elements.videoUrl.value);
  if (currentUrl && currentUrl === normalizeInputUrl(url)) {
    return;
  }

  pendingClipboardUrl = url;
  if (elements.clipboardPromptUrl) {
    elements.clipboardPromptUrl.textContent = url;
  }
  elements.clipboardPrompt.classList.add('show');
}

async function acceptClipboardUrl() {
  if (!pendingClipboardUrl) {
    return;
  }

  const url = pendingClipboardUrl;
  hideClipboardPrompt();
  navigateTo('downloader');
  elements.videoUrl.value = url;
  await fetchVideoInfo();
}

async function dismissClipboardUrl() {
  if (pendingClipboardUrl && window.electronAPI.dismissClipboardUrl) {
    await window.electronAPI.dismissClipboardUrl(pendingClipboardUrl);
  }
  hideClipboardPrompt();
}

function showDownloadNotification(title, filePath) {
  if (!isNotificationsEnabled() || !window.electronAPI.showNotification) {
    return;
  }

  window.electronAPI.showNotification({
    title: t('notifyDownloadTitle'),
    body: `${title || t('downloadSuccess')}\n${filePath || ''}`
  });
}

function showStatus(message, type = 'info') {
  elements.statusBar.classList.remove('info', 'success', 'error');
  elements.statusBar.classList.add('show', type);
  if (elements.statusMessage) {
    elements.statusMessage.textContent = message;
  }

  setTimeout(() => {
    elements.statusBar.classList.remove('show', 'info', 'success', 'error');
    if (elements.statusMessage && !elements.statusBar.classList.contains('show')) {
      elements.statusMessage.textContent = t('statusIdle');
    }
  }, 5000);
}

function normalizeInputUrl(rawUrl) {
  return String(rawUrl || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function updateWelcomePanel() {
  if (!elements.welcomePanel) {
    return;
  }

  const showWelcome = !currentVideoInfo && !elements.videoCard?.classList.contains('show');
  elements.welcomePanel.classList.toggle('show', showWelcome);
}

function updateSystemStatus(state, health = {}) {
  const badge = elements.systemStatusBadge;
  if (!badge) {
    return;
  }

  badge.classList.remove('loading', 'ready', 'error');
  badge.classList.add(state);

  const label = badge.querySelector('span');
  const icon = badge.querySelector('i');

  if (state === 'ready') {
    if (icon) {
      icon.className = 'fas fa-check-circle';
    }
    if (label) {
      label.textContent = t('systemReady');
    }
  } else if (state === 'error') {
    if (icon) {
      icon.className = 'fas fa-exclamation-circle';
    }
    if (label) {
      label.textContent = t('systemError');
    }
  } else {
    if (icon) {
      icon.className = 'fas fa-circle-notch fa-spin';
    }
    if (label) {
      label.textContent = t('systemLoading');
    }
  }

  updateSystemHealth(health);
  elements.repairBanner?.classList.toggle('show', state === 'error');
}

function updateSystemHealth(health = {}) {
  const setHealthItem = (el, ok) => {
    if (!el) {
      return;
    }
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('bad', !ok);
  };

  setHealthItem(elements.healthYtDlp, health.ytDlp);
  setHealthItem(elements.healthFfmpeg, health.ffmpeg);
}

function updateSearchControls() {
  const hasUrl = normalizeInputUrl(elements.videoUrl?.value).length > 0;
  const canSearch = appReady && hasUrl;
  elements.fetchBtn.disabled = !canSearch;
  elements.pasteBtn.disabled = !appReady;
}

function setSearchEnabled(enabled, health = {}) {
  appReady = enabled;
  updateSearchControls();
  updateSystemStatus(enabled ? 'ready' : 'error', health);
}

async function repairApp() {
  const buttons = [elements.repairBtn, elements.repairSettingsBtn].filter(Boolean);
  buttons.forEach((btn) => {
    btn.disabled = true;
  });

  showStatus(t('repairRunning'), 'info');
  updateSystemStatus('loading');

  try {
    const result = await window.electronAPI.repairApp();
    if (result.success) {
      setSearchEnabled(true, result);
      showStatus(t('repairSuccess'), 'success');
    } else {
      setSearchEnabled(false, result);
      showStatus(result.error || t('repairFailed'), 'error');
    }
  } catch (error) {
    setSearchEnabled(false);
    showStatus(`${t('repairFailed')}: ${error.message}`, 'error');
  } finally {
    buttons.forEach((btn) => {
      btn.disabled = false;
    });
  }
}

async function waitUntilAppReady() {
  if (appReady) return;

  showStatus(t('initWait'), 'info');

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await window.electronAPI.getAppStatus();
    if (status.ready) {
      setSearchEnabled(true, status);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  showStatus(t('initTimeout'), 'error');
}

// Fetch video info
async function fetchVideoInfo() {
  const url = normalizeInputUrl(elements.videoUrl.value);

  if (!url) {
    showStatus(t('errEnterUrl'), 'error');
    return;
  }

  if (!appReady) {
    await waitUntilAppReady();
    if (!appReady) {
      showStatus(t('errAppNotReady'), 'error');
      return;
    }
  }

  elements.videoUrl.value = url;

  // Reset UI
  elements.videoCard.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.downloadOptions.classList.remove('show');
  elements.successMessage.classList.remove('show');
  elements.progressContainer.classList.remove('show');
  elements.welcomePanel?.classList.remove('show');
  elements.loadingState.classList.add('show');
  elements.fetchBtn.disabled = true;
  
  const cachedInfo = clientInfoCache.get(url);
  if (cachedInfo) {
    currentVideoInfo = cachedInfo;
    displayVideoInfo(cachedInfo);
    showStatus(t('cacheHit'), 'success');
    elements.loadingState.classList.remove('show');
    updateSearchControls();
    return;
  }

  try {
    const result = await window.electronAPI.getVideoInfo(url);

    if (result.success) {
      clientInfoCache.set(url, result.data);
      currentVideoInfo = result.data;
      displayVideoInfo(result.data);
      showStatus(t('searchSuccess'), 'success');
    } else {
      showStatus(result.error || t('searchFailed'), 'error');
    }
  } catch (error) {
    showStatus(`${t('searchFailed')}: ${error.message}`, 'error');
  } finally {
    elements.loadingState.classList.remove('show');
    updateSearchControls();
  }
}

// Display video info
function displayVideoInfo(info, { preserveStudioMode = false } = {}) {
  elements.thumbnailImg.src = info.thumbnail;
  elements.durationBadge.textContent = formatDuration(info.duration);
  elements.videoTitle.textContent = info.title;
  const uploaderEl = document.getElementById('uploaderName');
  if (uploaderEl) {
    uploaderEl.textContent = info.uploader || t('unknown');
  }
  elements.videoDescription.textContent = info.description || '';
  elements.filenameInput.value = cleanFilename(info.title);
  elements.videoCard.classList.add('show');
  updateWelcomePanel();

  if (info.thumbnail) {
    elements.framePreviewImg.src = info.thumbnail;
  }

  if (!preserveStudioMode) {
    initStudioTimeline();
    setStudioMode('full');
    storedFormats = info.formats;
    downloadType = 'video-audio';
    setDownloadType('video-audio');
  }

  elements.studioPanel.classList.add('show');

  if (preserveStudioMode && storedFormats) {
    refreshUnifiedQualityGrid(true);
  }

  elements.downloadOptions.classList.add('show');
}

function clearAllSelections() {
  elements.unifiedQualityGrid?.querySelectorAll('.quality-option').forEach((el) => {
    el.classList.remove('selected');
  });
}

function createTierHeader(grid, tier) {
  const header = document.createElement('div');
  header.className = `quality-tier-header quality-tier-${tier.key}`;
  header.textContent = tier.label;
  grid.appendChild(header);
}

function createQualityCard({ label, formatText, sizeText, type, format, grid, autoSelect = false, badge = '' }) {
  const card = document.createElement('div');
  card.className = 'quality-option';
  card.dataset.formatId = format.formatId || format.height || 'best';
  card.innerHTML = `
    ${badge ? `<span class="quality-badge">${badge}</span>` : ''}
    <div class="quality-label">${label}</div>
    <div class="quality-format">${formatText}</div>
    <div class="quality-size">${sizeText}</div>
  `;
  card.addEventListener('click', () => selectQuality(card, type, format, grid));
  grid.appendChild(card);

  if (autoSelect) {
    selectQuality(card, type, format, grid);
  }

  return card;
}

function populateVideoGrid(grid, type, formats, formatLabel) {
  grid.innerHTML = '';

  const sorted = [...formats].sort((a, b) => (a.height || 0) - (b.height || 0));
  let hasAnyQuality = false;

  getVideoQualityTiers().forEach((tier) => {
    const tierFormats = sorted.filter((format) => format.height >= tier.min && format.height <= tier.max);
    if (tierFormats.length === 0) return;

    hasAnyQuality = true;
    createTierHeader(grid, tier);

    tierFormats.forEach((format) => {
      createQualityCard({
        label: format.quality,
        formatText: formatLabel,
        sizeText: formatSize(format.size),
        type,
        format,
        grid
      });
    });
  });

  if (!hasAnyQuality && sorted.length > 0) {
    createTierHeader(grid, { key: 'all', label: t('tierAll') });
    sorted.forEach((format) => {
      createQualityCard({
        label: format.quality,
        formatText: formatLabel,
        sizeText: formatSize(format.size),
        type,
        format,
        grid
      });
    });
  }

  createTierHeader(grid, { key: 'best', label: t('tierBest') });
  createQualityCard({
    label: t('bestQuality'),
    formatText: formatLabel,
    sizeText: t('highestQuality'),
    type,
    format: { formatId: 'best', height: 'best' },
    grid,
    autoSelect: true,
    badge: t('badgeBest')
  });
}

function populateAudioGrid(formats, grid = elements.unifiedQualityGrid) {
  grid.innerHTML = '';

  const sorted = [...formats].sort((a, b) => (a.abr || 0) - (b.abr || 0));
  let hasAnyQuality = false;

  getAudioQualityTiers().forEach((tier) => {
    const tierFormats = sorted.filter((format) => {
      const abr = format.abr || 0;
      const min = tier.min ?? 0;
      const max = tier.max ?? Infinity;
      return abr >= min && abr <= max;
    });

    if (tierFormats.length === 0) return;

    hasAnyQuality = true;
    createTierHeader(grid, tier);

    tierFormats.forEach((format) => {
      createQualityCard({
        label: format.quality,
        formatText: 'MP3',
        sizeText: formatSize(format.size),
        type: 'audio',
        format,
        grid
      });
    });
  });

  if (!hasAnyQuality && sorted.length > 0) {
    createTierHeader(grid, { key: 'all', label: t('tierAll') });
    sorted.forEach((format) => {
      createQualityCard({
        label: format.quality,
        formatText: 'MP3',
        sizeText: formatSize(format.size),
        type: 'audio',
        format,
        grid
      });
    });
  }

  createTierHeader(grid, { key: 'best', label: t('tierBest') });
  createQualityCard({
    label: t('bestQuality'),
    formatText: 'MP3',
    sizeText: t('highestAudio'),
    type: 'audio',
    format: { formatId: 'best' },
    grid,
    autoSelect: true,
    badge: t('badgeBest')
  });
}

// Select quality
function selectQuality(element, type, format, grid) {
  clearAllSelections();
  element.classList.add('selected');

  selectedType = type;
  selectedFormat = format.formatId || 'best';
  selectedHeight = type === 'audio' ? null : (format.height || format.formatId || 'best');
  selectedHasAudio = type === 'video-audio';
}

function getDownloadTypeLabel(type, mode = studioMode) {
  if (mode === 'image') {
    return imageMode === 'thumbnail' ? t('typeThumbnail') : t('typeFrame');
  }
  if (mode === 'clip') {
    return type === 'video-only' ? t('typeClipNoAudio') : t('typeClipAudio');
  }
  if (type === 'audio') return t('typeAudio');
  if (type === 'video-only') return t('typeVideoOnly');
  return t('typeVideoAudio');
}

// Start download
async function startDownload() {
  if (!currentVideoInfo) {
    showStatus(t('errSearchFirst'), 'error');
    return;
  }

  const filename = elements.filenameInput.value.trim() || cleanFilename(currentVideoInfo.title);
  let downloadOptions = {};
  let extension = '.mp4';
  let historyType = selectedType;
  let progressMessage = t('downloading');

  if (studioMode === 'image') {
    downloadOptions = {
      mode: 'image',
      imageMode,
      imageFormat,
      frameTime,
      aspectRatio: imageAspect,
      maskShape,
      cropPos: cropPositionPercent,
      customWidth: parseInt(document.getElementById('customAspectWidth')?.value) || 1080,
      customHeight: parseInt(document.getElementById('customAspectHeight')?.value) || 1080,
      thumbnailUrl: currentVideoInfo.thumbnail,
      filename
    };
    extension = `.${imageFormat}`;
    historyType = 'image';
    progressMessage = imageMode === 'thumbnail'
      ? t('progressThumbnail')
      : `${t('progressFrame')} ${formatTimecode(frameTime)}...`;
  } else if (studioMode === 'clip') {
    if (!selectedFormat || !selectedHeight) {
      showStatus(t('errSelectClipQuality'), 'error');
      return;
    }

    clampClipRange();
    const clipType = getActiveDownloadType();

    downloadOptions = {
      mode: 'clip',
      type: clipType,
      format: selectedFormat,
      height: selectedHeight,
      hasAudio: clipType === 'video-audio',
      clipStart,
      clipEnd,
      filename: `${filename}${extension}`
    };
    historyType = clipType;
    progressMessage = `${t('progressClipExport')} ${formatShortTime(clipStart)} → ${formatShortTime(clipEnd)}...`;
  } else {
    if (!selectedFormat || ((selectedType === 'video-audio' || selectedType === 'video-only') && !selectedHeight)) {
      showStatus(t('errSelectQuality'), 'error');
      return;
    }

    extension = selectedType === 'audio' ? '.mp3' : '.mp4';
    downloadOptions = {
      mode: 'full',
      format: selectedFormat,
      height: selectedHeight,
      type: selectedType,
      hasAudio: selectedHasAudio,
      filename: `${filename}${extension}`
    };
    progressMessage = selectedType === 'video-only'
      ? t('progressClip')
      : selectedType === 'video-audio'
        ? t('progressVideoAudio')
        : t('progressAudio');
  }

  elements.downloadOptions.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.progressContainer.classList.add('show');
  elements.progressPercent.textContent = '0%';
  elements.progressFill.style.width = '0%';
  elements.progressInfo.textContent = progressMessage;
  elements.downloadBtn.disabled = true;
  if (elements.settingsDownloadBtn) {
    elements.settingsDownloadBtn.disabled = true;
  }

  if (elements.circularProgressWidget) {
    elements.circularProgressWidget.classList.remove('hidden');
  }
  if (elements.quickPlayBtn) {
    elements.quickPlayBtn.classList.add('hidden');
  }
  if (elements.settingsQuickPlayBtn) {
    elements.settingsQuickPlayBtn.style.opacity = '0.5';
    elements.settingsQuickPlayBtn.style.pointerEvents = 'none';
  }
  updateCircularProgress(0);

  downloadOptions.turbo = isTurboEnabled();
  downloadOptions.audioEnhance = isAudioEnhanceEnabled();
  downloadOptions.downloadDir = getStoredDownloadPath();

  try {
    const result = await window.electronAPI.downloadVideo({
      url: elements.videoUrl.value.trim(),
      options: downloadOptions
    });

    if (result.success) {
      lastDownloadedPath = result.path;
      updateCircularProgress(100);
      if (elements.quickPlayBtn) {
        elements.quickPlayBtn.classList.remove('hidden');
      }
      if (elements.settingsQuickPlayBtn) {
        elements.settingsQuickPlayBtn.style.opacity = '1';
        elements.settingsQuickPlayBtn.style.pointerEvents = 'auto';
      }

      addToHistory({
        title: currentVideoInfo.title,
        thumbnail: currentVideoInfo.thumbnail,
        uploader: currentVideoInfo.uploader,
        type: historyType,
        typeLabel: getDownloadTypeLabel(historyType, studioMode),
        path: result.path,
        date: new Date().toLocaleString(window.i18n?.getLanguage?.() === 'ar' ? 'ar-SA' : undefined)
      });
      
      elements.progressContainer.classList.remove('show');
      elements.successMessage.classList.add('show');
      elements.successPath.textContent = result.path;
      showStatus(t('downloadSuccessStatus'), 'success');
      showDownloadNotification(currentVideoInfo?.title, result.path);
    } else {
      elements.progressContainer.classList.remove('show');
      elements.downloadOptions.classList.add('show');
      elements.studioPanel.classList.add('show');
      showStatus(result.error || t('errDownloadFailed'), 'error');
    }
  } catch (error) {
    elements.progressContainer.classList.remove('show');
    elements.downloadOptions.classList.add('show');
    elements.studioPanel.classList.add('show');
    showStatus(`${t('errDownloadFailed')}: ${error.message}`, 'error');
  } finally {
    elements.downloadBtn.disabled = false;
    if (elements.settingsDownloadBtn) elements.settingsDownloadBtn.disabled = false;
  }
}

function updateCircularProgress(progress) {
  const percent = Math.min(100, Math.max(0, Math.round(progress || 0)));
  
  if (elements.circularProgressWidget) elements.circularProgressWidget.classList.remove('hidden');
  if (elements.circularPercentText) elements.circularPercentText.textContent = `${percent}%`;
  
  const circumference = 138.23;
  const offset = circumference - (percent / 100) * circumference;
  if (elements.progressRingCircle) elements.progressRingCircle.style.strokeDashoffset = offset;

  if (percent >= 100) {
    if (elements.quickPlayBtn) elements.quickPlayBtn.classList.remove('hidden');
    if (elements.settingsQuickPlayBtn) {
      elements.settingsQuickPlayBtn.style.opacity = '1';
      elements.settingsQuickPlayBtn.style.pointerEvents = 'auto';
    }
  }
}

// Handle download progress
function handleDownloadProgress(data) {
  const prog = Number(data.progress) || 0;
  elements.progressPercent.textContent = `${Math.round(prog)}%`;
  elements.progressFill.style.width = `${Math.round(prog)}%`;
  updateCircularProgress(prog);

  if (data.message) {
    elements.progressInfo.textContent = data.message;
    return;
  }

  const details = [];
  if (data.speed) details.push(`${t('speed')}: ${data.speed}`);
  if (data.eta) details.push(`${t('remaining')}: ${data.eta}`);
  if (details.length) {
    elements.progressInfo.textContent = details.join(' • ');
  }
}

// Handle download destination
function handleDownloadDestination(data) {
  elements.progressInfo.textContent = `${t('savingTo')}: ${data.path}`;
}

// Add to history
function addToHistory(item) {
  downloadHistory.unshift(item);
  updateHistoryUI();
}

// Update history UI
function updateHistoryUI() {
  if (downloadHistory.length === 0) {
    elements.historyList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <h3>${escapeHtml(t('historyEmptyTitle'))}</h3>
        <p>${escapeHtml(t('historyEmptyDesc'))}</p>
      </div>
    `;
    return;
  }
  
  elements.historyList.innerHTML = downloadHistory.map((item, index) => `
    <div class="history-item">
      <img src="${item.thumbnail}" alt="${escapeHtml(item.title)}">
      <div class="history-info">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.uploader || t('unknown'))} • ${escapeHtml(item.typeLabel || getDownloadTypeLabel(item.type))} • ${escapeHtml(item.date)}</p>
      </div>
      <div class="history-actions">
        <button class="history-open" data-index="${index}" title="${escapeHtml(t('open'))}">
          <i class="fas fa-play"></i>
        </button>
        <button class="history-folder" data-index="${index}" title="${escapeHtml(t('showInFolder'))}">
          <i class="fas fa-folder-open"></i>
        </button>
        <button class="history-remove" data-index="${index}" title="${escapeHtml(t('removeHistory'))}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  bindHistoryActions();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindHistoryActions() {
  elements.historyList.querySelectorAll('.history-open').forEach((button) => {
    button.addEventListener('click', () => {
      const item = downloadHistory[Number(button.dataset.index)];
      if (item) window.electronAPI.openPath(item.path);
    });
  });

  elements.historyList.querySelectorAll('.history-folder').forEach((button) => {
    button.addEventListener('click', () => {
      const item = downloadHistory[Number(button.dataset.index)];
      if (item) window.electronAPI.showItemInFolder(item.path);
    });
  });

  elements.historyList.querySelectorAll('.history-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      downloadHistory.splice(index, 1);
      updateHistoryUI();
    });
  });
}

// Navigation
function navigateTo(section) {
  // Update nav items
  elements.navItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.section === section) {
      item.classList.add('active');
    }
  });
  
  // Update sections
  elements.sections.forEach(sec => {
    sec.classList.remove('active');
  });
  
  // Show selected section
  const sectionEl = document.getElementById(section + 'Section');
  if (sectionEl) {
    sectionEl.classList.add('active');
  }
  
  // Update page title
  currentSection = section;
  const titles = {
    downloader: t('pageDownloader'),
    history: t('pageHistory'),
    platforms: t('pagePlatforms'),
    tools: t('pageTools'),
    settings: t('pageSettings')
  };
  elements.pageTitle.textContent = titles[section] || 'VM';
  if (section === 'settings') initEnhancedSettings();
}

function initEnhancedSettings() {
  // 1. Download Scheduler in Settings
  const scheduleBtn = document.getElementById('settingStartScheduleBtn');
  const scheduleTime = document.getElementById('settingScheduleTime');
  const scheduleDelay = document.getElementById('settingScheduleDelayMin');
  const scheduleStatus = document.getElementById('settingScheduleStatus');

  if (scheduleBtn && !scheduleBtn.dataset.bound) {
    scheduleBtn.dataset.bound = 'true';
    scheduleBtn.addEventListener('click', () => {
      let delayMs = 0;
      if (scheduleTime?.value) {
        const [h, m] = scheduleTime.value.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        delayMs = target.getTime() - now.getTime();
      } else if (scheduleDelay?.value) {
        delayMs = Number(scheduleDelay.value) * 60 * 1000;
      }

      if (delayMs <= 0) {
        alert('الرجاء تحديد وقت بدء أو تحديد الدقائق المتبقية');
        return;
      }

      const startInMin = Math.round(delayMs / 60000);
      if (scheduleStatus) scheduleStatus.textContent = `تم تفعيل الجدولة بنجاح: سيبدأ التحميل التلقائي بعد ${startInMin} دقيقة تلقائياً ✓`;
      setTimeout(() => {
        if (typeof startBatchProcessing === 'function') startBatchProcessing();
      }, delayMs);
    });
  }

}

// Load platforms
async function loadPlatforms() {
  const platforms = await window.electronAPI.getSupportedPlatforms();
  
  elements.platformsGrid.innerHTML = platforms.map(p => `
    <div class="platform-card">
      <i class="fab fa-${getPlatformIcon(p.name)}"></i>
      <h4>${p.name}</h4>
    </div>
  `).join('');
}

function getPlatformIcon(name) {
  const icons = {
    'YouTube': 'youtube',
    'Instagram': 'instagram',
    'TikTok': 'tiktok',
    'Pinterest': 'pinterest',
    'Facebook': 'facebook',
    'Twitter / X': 'twitter',
    'SoundCloud': 'soundcloud',
    'Spotify': 'spotify',
    'Twitch': 'twitch',
    'LinkedIn': 'linkedin',
    'Threads': 'at',
    'Rumble': 'video',
    'VK': 'vk',
    'Telegram': 'telegram',
    'Bilibili': 'tv',
    'Vimeo': 'vimeo',
    'Dailymotion': 'dailymotion',
    'Reddit': 'reddit'
  };
  return icons[name] || 'globe';
}

// Paste from clipboard
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    elements.videoUrl.value = text;
    fetchVideoInfo();
  } catch (error) {
    showStatus(t('errClipboard'), 'error');
  }
}

// Clear all
function clearAll() {
  hideClipboardPrompt();
  elements.videoUrl.value = '';
  elements.videoCard.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.downloadOptions.classList.remove('show');
  elements.progressContainer.classList.remove('show');
  elements.successMessage.classList.remove('show');
  currentVideoInfo = null;
  selectedFormat = null;
  downloadType = 'video-audio';
  storedFormats = null;
  selectedType = 'video-audio';
  selectedHeight = 'best';
  selectedHasAudio = true;
  updateWelcomePanel();
}

// New download
function newDownload() {
  clearAll();
  elements.videoUrl.focus();
}

function getPreviewSummaryText() {
  if (studioMode === 'clip') {
    clampClipRange();
    const clipTypeLabel = getActiveDownloadType() === 'video-only' ? 'مقطع بدون صوت' : 'مقطع مع صوت';
    return `استوديو الإنتاج [قص مقطع: ${formatShortTime(clipStart)} ← ${formatShortTime(clipEnd)} | ${clipTypeLabel}]`;
  }
  if (studioMode === 'image') {
    if (imageMode === 'frame') {
      return `استوديو الإنتاج [لقطة من الوقت: ${formatTimecode(frameTime)} | صيغة: ${imageFormat.toUpperCase()}]`;
    }
    return `استوديو الإنتاج [الصورة المصغرة الأصلية | صيغة: ${imageFormat.toUpperCase()}]`;
  }
  const typeText = getActiveDownloadType() === 'audio' ? 'صوت فقط MP3' : (getActiveDownloadType() === 'video-only' ? 'فيديو فقط' : 'فيديو وصوت');
  return `إعدادات عامة [الجودة: ${selectedHeight || 'أفضل جودة'} | ${typeText}]`;
}

let currentSubBlobUrl = null;
let previewTimeUpdateListener = null;

// Video Preview
async function toggleVideoPreview(forceRefresh = false) {
  if (!currentVideoInfo) return;
  if (!forceRefresh && elements.previewPlayerBox && !elements.previewPlayerBox.classList.contains('hidden')) {
    if (elements.previewVideoEl) {
      elements.previewVideoEl.pause();
      if (previewTimeUpdateListener) {
        elements.previewVideoEl.removeEventListener('timeupdate', previewTimeUpdateListener);
        previewTimeUpdateListener = null;
      }
    }
    elements.previewPlayerBox.classList.add('hidden');
    return;
  }

  const url = elements.videoUrl.value.trim();
  const options = {
    mode: studioMode,
    type: getActiveDownloadType(),
    height: selectedHeight,
    format: selectedFormat
  };

  if (elements.previewActiveBadge) {
    elements.previewActiveBadge.textContent = getPreviewSummaryText();
  }

  showStatus('جاري تطبيق تعديلات استوديو الإنتاج على المعاينة...', 'info');

  try {
    const res = await window.electronAPI.getStreamUrl({ url, options });
    if (res.success && res.url) {
      if (elements.previewVideoEl) {
        if (previewTimeUpdateListener) {
          elements.previewVideoEl.removeEventListener('timeupdate', previewTimeUpdateListener);
          previewTimeUpdateListener = null;
        }

        // Clear existing tracks
        Array.from(elements.previewVideoEl.querySelectorAll('track')).forEach((tr) => tr.remove());
        if (currentSubBlobUrl) {
          URL.revokeObjectURL(currentSubBlobUrl);
          currentSubBlobUrl = null;
        }

        elements.previewVideoEl.src = res.url;
        elements.previewVideoEl.poster = currentVideoInfo.thumbnailUrl || '';
        elements.previewPlayerBox?.classList.remove('hidden');

        // 1. Production Studio: Clip Mode
        if (studioMode === 'clip' && videoDuration > 0) {
          clampClipRange();
          const activeType = getActiveDownloadType();
          elements.previewVideoEl.muted = activeType === 'video-only';
          elements.previewVideoEl.currentTime = clipStart;

          previewTimeUpdateListener = () => {
            if (elements.previewVideoEl.currentTime >= clipEnd) {
              elements.previewVideoEl.currentTime = clipStart;
            }
          };
          elements.previewVideoEl.addEventListener('timeupdate', previewTimeUpdateListener);
        } else {
          elements.previewVideoEl.muted = false;
        }

        // 2. Production Studio: Frame Image Mode
        if (studioMode === 'image') {
          if (imageMode === 'frame') {
            elements.previewVideoEl.currentTime = Math.max(0, Math.min(frameTime, videoDuration || frameTime));
            elements.previewVideoEl.pause();
            showStatus(`تمت معاينة اللقطة المحددة من الوقت ${formatTimecode(frameTime)} بصيغة ${imageFormat.toUpperCase()}`, 'success');
            return;
          }
        }


        if (forceRefresh) {
          elements.previewVideoEl.load();
        }

        if (studioMode !== 'image') {
          elements.previewVideoEl.play().catch(() => {});
        }
      }
      showStatus('تمت معاينة تعديلات استوديو الإنتاج على الفيديو بنجاح', 'success');
    } else {
      showStatus(res.error || t('searchFailed'), 'error');
    }
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// Batch Queue
let batchSelectedIds = new Set();
let showBulkEditor = false;

function getSelectedBatchItems() {
  return downloadQueue.filter((q) => batchSelectedIds.has(q.id));
}

function syncBatchSelection() {
  const validIds = new Set(downloadQueue.map((q) => q.id));
  batchSelectedIds = new Set([...batchSelectedIds].filter((id) => validIds.has(id)));
  if (batchSelectedIds.size === 0) showBulkEditor = false;
}

window.toggleBatchItemSelect = function(itemId, event) {
  if (event) event.stopPropagation();
  if (batchSelectedIds.has(itemId)) batchSelectedIds.delete(itemId);
  else batchSelectedIds.add(itemId);
  if (batchSelectedIds.size === 0) showBulkEditor = false;
  updateQueueUI();
};

window.toggleSelectAllBatch = function(event) {
  if (event) event.stopPropagation();
  const allIds = downloadQueue.map((q) => q.id);
  if (batchSelectedIds.size === allIds.length && allIds.length > 0) {
    batchSelectedIds.clear();
    showBulkEditor = false;
  } else {
    batchSelectedIds = new Set(allIds);
  }
  updateQueueUI();
};

window.clearBatchSelection = function(event) {
  if (event) event.stopPropagation();
  batchSelectedIds.clear();
  showBulkEditor = false;
  updateQueueUI();
};

window.moveBatchItem = function(itemId, direction, event) {
  if (event) event.stopPropagation();
  const idx = downloadQueue.findIndex((q) => q.id === itemId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= downloadQueue.length) return;
  const item = downloadQueue[idx];
  if (item.status === 'downloading' || downloadQueue[newIdx].status === 'downloading') {
    showStatus('لا يمكن نقل رابط قيد التحميل حالياً', 'info');
    return;
  }
  downloadQueue[idx] = downloadQueue[newIdx];
  downloadQueue[newIdx] = item;
  updateQueueUI();
};

window.moveBatchItemToFirst = function(itemId, event) {
  if (event) event.stopPropagation();
  const idx = downloadQueue.findIndex((q) => q.id === itemId);
  if (idx < 0) return;
  const item = downloadQueue[idx];
  if (item.status !== 'pending') {
    showStatus('يمكن تقديم رابط بانتظار التحميل فقط', 'info');
    return;
  }
  downloadQueue.splice(idx, 1);
  const insertAt = downloadQueue.findIndex((q) => q.status === 'pending');
  if (insertAt < 0) downloadQueue.push(item);
  else downloadQueue.splice(insertAt, 0, item);
  updateQueueUI();
  showStatus('① سيتم تحميل هذا الرابط أولاً', 'success');
};

window.moveSelectedBatchToFirst = function(event) {
  if (event) event.stopPropagation();
  const selected = getSelectedBatchItems().filter((q) => q.status === 'pending');
  if (selected.length === 0) {
    showStatus('حدّد روابط بانتظار التحميل لتقديمها', 'info');
    return;
  }
  // أبقِ ترتيب المحدد كما هو، وضعه في مقدمة قائمة الانتظار
  const selectedIds = new Set(selected.map((q) => q.id));
  const rest = downloadQueue.filter((q) => !selectedIds.has(q.id));
  const firstPending = rest.findIndex((q) => q.status === 'pending');
  if (firstPending < 0) {
    downloadQueue = [...rest, ...selected];
  } else {
    downloadQueue = [
      ...rest.slice(0, firstPending),
      ...selected,
      ...rest.slice(firstPending)
    ];
  }
  updateQueueUI();
  showStatus(`① تم تقديم ${selected.length} رابط للتحميل أولاً`, 'success');
};

window.deleteSelectedBatchItems = function(event) {
  if (event) event.stopPropagation();
  if (batchSelectedIds.size === 0) return;
  const before = downloadQueue.length;
  downloadQueue = downloadQueue.filter((q) => !batchSelectedIds.has(q.id) || q.status === 'downloading');
  const removed = before - downloadQueue.length;
  syncBatchSelection();
  updateQueueUI();
  showStatus(removed > 0 ? `تم حذف ${removed} رابط من القائمة` : 'لا يمكن حذف رابط قيد التحميل', 'info');
};

window.toggleBulkEditor = function(event) {
  if (event) event.stopPropagation();
  if (batchSelectedIds.size === 0) {
    showStatus('حدّد رابطاً واحداً أو أكثر للتعديل', 'info');
    return;
  }
  showBulkEditor = !showBulkEditor;
  // أغلق محررات الفردي عند فتح الجماعي
  if (showBulkEditor) {
    downloadQueue.forEach((q) => { q.showEditor = false; });
  }
  updateQueueUI();
};

window.saveBulkBatchEditor = function(event) {
  if (event) event.stopPropagation();
  const selected = getSelectedBatchItems();
  if (selected.length === 0) return;

  const qualitySelect = document.getElementById('bulk_edit_quality');
  const typeSelect = document.getElementById('bulk_edit_type');
  const filenameInput = document.getElementById('bulk_edit_filename');
  const applyQuality = document.getElementById('bulk_apply_quality')?.checked !== false;
  const applyType = document.getElementById('bulk_apply_type')?.checked !== false;
  const applyFilename = document.getElementById('bulk_apply_filename')?.checked === true;

  selected.forEach((item) => {
    if (item.status === 'downloading' || item.status === 'done') return;
    if (applyQuality && qualitySelect) item.quality = qualitySelect.value;
    if (applyType && typeSelect) item.type = typeSelect.value;
    if (applyFilename && filenameInput) item.filename = filenameInput.value.trim();
  });

  showBulkEditor = false;
  updateQueueUI();
  showStatus(`تم تطبيق الإعدادات على ${selected.length} رابط`, 'success');
};

window.toggleBatchItemEditor = function(itemId, event) {
  if (event) event.stopPropagation();
  const item = downloadQueue.find((q) => q.id === itemId || q.url === itemId);
  if (item) {
    showBulkEditor = false;
    const opening = !item.showEditor;
    downloadQueue.forEach((q) => { q.showEditor = false; });
    item.showEditor = opening;
    updateQueueUI();
  }
};

window.removeBatchQueueItem = function(itemId, event) {
  if (event) event.stopPropagation();
  const item = downloadQueue.find((q) => q.id === itemId);
  if (item?.status === 'downloading') {
    showStatus('لا يمكن حذف رابط قيد التحميل', 'info');
    return;
  }
  downloadQueue = downloadQueue.filter((q) => q.id !== itemId && q.url !== itemId);
  batchSelectedIds.delete(itemId);
  syncBatchSelection();
  updateQueueUI();
  showStatus('تم حذف الرابط من القائمة', 'info');
};

window.saveBatchItemEditor = function(itemId, event) {
  if (event) event.stopPropagation();
  const item = downloadQueue.find((q) => q.id === itemId || q.url === itemId);
  if (!item) return;

  const urlInput = document.getElementById(`edit_url_${itemId}`);
  const qualitySelect = document.getElementById(`edit_quality_${itemId}`);
  const typeSelect = document.getElementById(`edit_type_${itemId}`);
  const filenameInput = document.getElementById(`edit_filename_${itemId}`);

  if (urlInput && urlInput.value.trim()) {
    item.url = urlInput.value.trim();
  }
  if (qualitySelect) item.quality = qualitySelect.value;
  if (typeSelect) item.type = typeSelect.value;
  if (filenameInput) item.filename = filenameInput.value.trim();

  item.showEditor = false;
  updateQueueUI();
  showStatus('تم حفظ إعدادات الرابط بنجاح', 'success');
};

function renderBulkEditorHtml() {
  if (!showBulkEditor || batchSelectedIds.size === 0) return '';
  const count = batchSelectedIds.size;
  return `
    <div class="batch-bulk-editor" onclick="event.stopPropagation()">
      <div class="batch-bulk-editor-header">
        <strong><i class="fas fa-sliders-h"></i> تعديل إعدادات ${count} رابط محدد</strong>
        <button type="button" class="btn-batch-icon" onclick="toggleBulkEditor(event)" title="إغلاق"><i class="fas fa-times"></i></button>
      </div>
      <p class="batch-bulk-hint">طبّق الجودة / النوع على المحدد — يمكنك اختيار ما يُطبَّق فقط</p>
      <div class="batch-bulk-grid">
        <label class="batch-bulk-field">
          <span class="batch-bulk-check"><input type="checkbox" id="bulk_apply_quality" checked> الجودة</span>
          <select id="bulk_edit_quality">
            <option value="best">أفضل جودة (Best HD)</option>
            <option value="1080">1080p Full HD</option>
            <option value="720">720p HD</option>
            <option value="480">480p</option>
            <option value="360">360p</option>
          </select>
        </label>
        <label class="batch-bulk-field">
          <span class="batch-bulk-check"><input type="checkbox" id="bulk_apply_type" checked> نوع التحميل</span>
          <select id="bulk_edit_type">
            <option value="video-audio">فيديو + صوت</option>
            <option value="video-only">فيديو فقط</option>
            <option value="audio">صوت MP3</option>
          </select>
        </label>
        <label class="batch-bulk-field batch-bulk-field-wide">
          <span class="batch-bulk-check"><input type="checkbox" id="bulk_apply_filename"> اسم ملف موحّد (اختياري)</span>
          <input type="text" id="bulk_edit_filename" placeholder="يُطبَّق على الكل إن تم التفعيل...">
        </label>
      </div>
      <div class="batch-bulk-actions">
        <button type="button" class="btn-batch-apply-bulk" onclick="saveBulkBatchEditor(event)">
          <i class="fas fa-check"></i> تطبيق على المحدد (${count})
        </button>
      </div>
    </div>
  `;
}

function updateQueueUI() {
  if (!elements.batchQueueList) return;
  syncBatchSelection();

  if (downloadQueue.length === 0) {
    batchSelectedIds.clear();
    showBulkEditor = false;
    elements.batchQueueList.innerHTML = `<p class="batch-desc">${t('batchDesc')}</p>`;
    if (elements.startBatchBtn) elements.startBatchBtn.disabled = true;
    return;
  }

  const pendingCount = downloadQueue.filter((q) => q.status === 'pending').length;
  const doneCount = downloadQueue.filter((q) => q.status === 'done').length;
  const selectedCount = batchSelectedIds.size;
  const allSelected = selectedCount === downloadQueue.length;
  if (elements.startBatchBtn) elements.startBatchBtn.disabled = isQueueProcessing || pendingCount === 0;

  const headerHtml = `
    <div class="batch-queue-summary">
      <span>سلسلة الروابط: <strong>${downloadQueue.length}</strong> (اكتمل: ${doneCount} | المتبقي: ${pendingCount})</span>
      <span class="batch-queue-hint">حدّد روابط ← رتّب / عدّل / قدّم للتحميل أولاً</span>
    </div>
    <div class="batch-selection-toolbar">
      <label class="batch-select-all">
        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="toggleSelectAllBatch(event)" title="تحديد الكل">
        <span>${allSelected ? 'إلغاء الكل' : 'تحديد الكل'}</span>
      </label>
      <span class="batch-selected-count">${selectedCount > 0 ? `محدد: ${selectedCount}` : 'لا تحديد'}</span>
      <div class="batch-toolbar-actions">
        <button type="button" class="btn-batch-tool" onclick="moveSelectedBatchToFirst(event)" ${selectedCount === 0 ? 'disabled' : ''} title="تحميل المحدد أولاً">
          <i class="fas fa-angle-double-up"></i> تحميل أولاً
        </button>
        <button type="button" class="btn-batch-tool btn-batch-tool-edit" onclick="toggleBulkEditor(event)" ${selectedCount === 0 ? 'disabled' : ''} title="تعديل إعدادات المحدد">
          <i class="fas fa-sliders-h"></i> تعديل المحدد
        </button>
        <button type="button" class="btn-batch-tool btn-batch-tool-danger" onclick="deleteSelectedBatchItems(event)" ${selectedCount === 0 ? 'disabled' : ''} title="حذف المحدد">
          <i class="fas fa-trash-alt"></i>
        </button>
        <button type="button" class="btn-batch-tool" onclick="clearBatchSelection(event)" ${selectedCount === 0 ? 'disabled' : ''} title="إلغاء التحديد">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    ${renderBulkEditorHtml()}
  `;

  const itemsHtml = downloadQueue.map((item, idx) => {
    const statusText = item.status === 'pending' ? 'انتظار' : (item.status === 'downloading' ? 'جاري التحميل...' : (item.status === 'done' ? 'اكتمل ✓' : 'خطأ ✗'));
    const isCustomized = (item.quality && item.quality !== 'best') || (item.type && item.type !== 'video-audio') || item.filename;
    const badgeText = isCustomized ? ` [${item.type === 'audio' ? 'MP3' : item.quality + 'p'}]` : '';
    const isSelected = batchSelectedIds.has(item.id);
    const isNext = item.status === 'pending' && downloadQueue.find((q) => q.status === 'pending')?.id === item.id;
    const canMoveUp = idx > 0 && item.status !== 'downloading' && downloadQueue[idx - 1].status !== 'downloading';
    const canMoveDown = idx < downloadQueue.length - 1 && item.status !== 'downloading' && downloadQueue[idx + 1].status !== 'downloading';

    return `
      <div class="batch-item-wrapper ${isSelected ? 'selected' : ''} ${isNext ? 'is-next' : ''}">
        <div class="batch-item ${item.status} ${isSelected ? 'selected' : ''}">
          <div class="batch-item-left">
            <input type="checkbox" class="batch-item-check" ${isSelected ? 'checked' : ''} onclick="toggleBatchItemSelect('${item.id}', event)" title="تحديد">
            <div class="batch-reorder-btns">
              <button type="button" class="btn-batch-reorder" onclick="moveBatchItemToFirst('${item.id}', event)" title="تحميل أولاً" ${item.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-angle-double-up"></i></button>
              <button type="button" class="btn-batch-reorder" onclick="moveBatchItem('${item.id}', -1, event)" title="أعلى" ${!canMoveUp ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
              <button type="button" class="btn-batch-reorder" onclick="moveBatchItem('${item.id}', 1, event)" title="أسفل" ${!canMoveDown ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
            </div>
            <span class="batch-item-num">${idx + 1}${isNext ? '<small>التالي</small>' : ''}</span>
            <span class="batch-item-url" title="${escapeHtml(item.url)}" onclick="toggleBatchItemSelect('${item.id}', event)">${escapeHtml(item.url)}<strong class="batch-item-badge">${badgeText}</strong></span>
          </div>
          <div class="batch-item-right-actions">
            <span class="batch-item-status ${item.status}">${statusText}</span>
            <button type="button" class="btn-batch-mini-edit" onclick="toggleBatchItemEditor('${item.id}', event)" title="إعدادات هذا الرابط">
              <i class="fas fa-cog"></i>
            </button>
            <button type="button" class="btn-batch-mini-delete" onclick="removeBatchQueueItem('${item.id}', event)" title="حذف" ${item.status === 'downloading' ? 'disabled' : ''}>
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>

        ${item.showEditor ? `
          <div class="batch-item-editor" onclick="event.stopPropagation()">
            <div class="batch-item-editor-header">
              <strong><i class="fas fa-sliders-h"></i> إعدادات الرابط رقم ${idx + 1}</strong>
              <button type="button" class="btn-batch-icon" onclick="toggleBatchItemEditor('${item.id}', event)"><i class="fas fa-times"></i></button>
            </div>
            <div>
              <label class="batch-editor-label">تعديل الرابط:</label>
              <input type="text" id="edit_url_${item.id}" value="${escapeHtml(item.url)}" class="batch-editor-input">
            </div>
            <div class="batch-editor-row">
              <div>
                <label class="batch-editor-label">الجودة:</label>
                <select id="edit_quality_${item.id}" class="batch-editor-input">
                  <option value="best" ${(item.quality || 'best') === 'best' ? 'selected' : ''}>أفضل جودة (Best HD)</option>
                  <option value="1080" ${item.quality === '1080' ? 'selected' : ''}>1080p Full HD</option>
                  <option value="720" ${item.quality === '720' ? 'selected' : ''}>720p HD</option>
                  <option value="480" ${item.quality === '480' ? 'selected' : ''}>480p</option>
                  <option value="360" ${item.quality === '360' ? 'selected' : ''}>360p</option>
                </select>
              </div>
              <div>
                <label class="batch-editor-label">نوع التحميل:</label>
                <select id="edit_type_${item.id}" class="batch-editor-input">
                  <option value="video-audio" ${(item.type || 'video-audio') === 'video-audio' ? 'selected' : ''}>فيديو + صوت</option>
                  <option value="video-only" ${item.type === 'video-only' ? 'selected' : ''}>فيديو فقط</option>
                  <option value="audio" ${item.type === 'audio' ? 'selected' : ''}>صوت MP3</option>
                </select>
              </div>
            </div>
            <div>
              <label class="batch-editor-label">اسم الملف المخصص (اختياري):</label>
              <input type="text" id="edit_filename_${item.id}" value="${escapeHtml(item.filename || '')}" placeholder="اسم الملف..." class="batch-editor-input">
            </div>
            <div class="batch-editor-footer">
              <button type="button" onclick="moveBatchItemToFirst('${item.id}', event)" class="btn-batch-mini-edit" ${item.status !== 'pending' ? 'disabled' : ''}>
                <i class="fas fa-angle-double-up"></i> تحميل أولاً
              </button>
              <button type="button" onclick="saveBatchItemEditor('${item.id}', event)" class="btn-batch-save">
                <i class="fas fa-check"></i> حفظ
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  elements.batchQueueList.innerHTML = headerHtml + itemsHtml;
}

function addUrlsToQueue() {
  const text = elements.batchUrlsText?.value || '';
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let added = 0;

  lines.forEach((line) => {
    try {
      const parsed = new URL(line.startsWith('http') ? line : `https://${line}`);
      const urlStr = parsed.toString();
      if (!downloadQueue.some((q) => q.url === urlStr)) {
        downloadQueue.push({
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          url: urlStr,
          status: 'pending',
          quality: 'best',
          type: 'video-audio',
          filename: '',
          showEditor: false
        });
        added += 1;
      }
    } catch {
      // invalid link
    }
  });

  if (elements.batchUrlsText) elements.batchUrlsText.value = '';
  updateQueueUI();
  if (added > 0) {
    showStatus(`تمت إضافة ${added} رابط إلى سلسلة التنزيل التلقائي`, 'success');
  }
}

async function pasteAndAddUrlsToQueue() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showStatus(t('errClipboard'), 'error');
      return;
    }

    if (elements.batchUrlsText) {
      const current = elements.batchUrlsText.value ? elements.batchUrlsText.value + '\n' : '';
      elements.batchUrlsText.value = current + text.trim();
    }

    addUrlsToQueue();
  } catch (err) {
    showStatus(t('errClipboard'), 'error');
  }
}

function clearBatchQueue() {
  if (downloadQueue.some((q) => q.status === 'downloading')) {
    showStatus('انتظر انتهاء التحميل الحالي قبل إفراغ القائمة', 'info');
    return;
  }
  downloadQueue = [];
  batchSelectedIds.clear();
  showBulkEditor = false;
  updateQueueUI();
  showStatus('تم إفراغ قائمة التحميل المتتالي', 'info');
}

// ─── Auto-Paste to Batch Queue ────────────────────────────────────────────────
const AUTO_PASTE_BATCH_KEY = 'vm_auto_paste_batch';
let autoPasteBatchEnabled = localStorage.getItem(AUTO_PASTE_BATCH_KEY) === 'true';
let autoPasteToastTimer = null;
let autoPasteEventsBound = false;

function showAutoPasteToast(url, count = 1) {
  let toast = document.getElementById('autoPasteToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'autoPasteToast';
    toast.className = 'auto-paste-toast';
    toast.innerHTML = `
      <i class="fas fa-clipboard-check"></i>
      <span id="autoPasteToastMsg">تمت الإضافة تلقائياً للقائمة</span>
      <span class="toast-url" id="autoPasteToastUrl"></span>`;
    document.body.appendChild(toast);
  }
  const msgEl = document.getElementById('autoPasteToastMsg');
  const urlEl = document.getElementById('autoPasteToastUrl');
  if (msgEl) {
    msgEl.textContent = count > 1
      ? `تمت إضافة ${count} روابط تلقائياً للقائمة`
      : 'تمت الإضافة تلقائياً للقائمة';
  }
  if (urlEl) urlEl.textContent = count > 1 ? '' : (url || '');
  toast.classList.add('show');
  clearTimeout(autoPasteToastTimer);
  autoPasteToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function updateAutoPasteBtn() {
  const btn    = document.getElementById('autoPasteBatchBtn');
  const badge  = document.getElementById('autoPasteStatusBadge');
  const icon   = document.getElementById('autoPasteIcon');
  if (!btn) return;

  if (autoPasteBatchEnabled) {
    btn.classList.add('active');
    if (badge)  badge.textContent = 'ON';
    if (icon)   { icon.className = 'fas fa-clipboard-check'; }
  } else {
    btn.classList.remove('active');
    if (badge)  badge.textContent = 'OFF';
    if (icon)   { icon.className = 'fas fa-clipboard'; }
  }
}

function addAutoPasteUrlsToQueue(urls) {
  if (!autoPasteBatchEnabled || !Array.isArray(urls) || urls.length === 0) return;

  let added = 0;
  let lastUrl = '';

  for (const raw of urls) {
    try {
      const urlStr = new URL(String(raw).trim()).toString();
      if (downloadQueue.some((q) => q.url === urlStr)) continue;

      downloadQueue.push({
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        url: urlStr,
        status: 'pending',
        quality: 'best',
        type: 'video-audio',
        filename: '',
        showEditor: false
      });
      added += 1;
      lastUrl = urlStr;
    } catch {
      // skip invalid
    }
  }

  if (added > 0) {
    updateQueueUI();
    showAutoPasteToast(lastUrl, added);

    const panel = document.getElementById('batchQueuePanel');
    if (panel?.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function bindAutoPasteEvents() {
  if (autoPasteEventsBound) return;
  autoPasteEventsBound = true;

  window.electronAPI.onBatchAutoPasteUrls?.((data) => {
    if (!autoPasteBatchEnabled) return;
    addAutoPasteUrlsToQueue(data?.urls || []);
  });
}

async function enableAutoPasteBatch(showMsg = true) {
  autoPasteBatchEnabled = true;
  localStorage.setItem(AUTO_PASTE_BATCH_KEY, 'true');
  updateAutoPasteBtn();
  bindAutoPasteEvents();
  // المراقبة السريعة في العملية الرئيسية — تتجاهل الحافظة الحالية
  await window.electronAPI.setBatchAutoPaste?.(true);
  if (showMsg) {
    showStatus('✅ اللصق التلقائي مُفعَّل — انسخ الروابط بسرعة وسيُضاف كل واحد فوراً', 'success');
  }
}

async function disableAutoPasteBatch(showMsg = true) {
  autoPasteBatchEnabled = false;
  localStorage.setItem(AUTO_PASTE_BATCH_KEY, 'false');
  updateAutoPasteBtn();
  await window.electronAPI.setBatchAutoPaste?.(false);
  if (showMsg) {
    showStatus('⏸ اللصق التلقائي متوقف', 'info');
  }
}

async function toggleAutoPasteBatch() {
  if (autoPasteBatchEnabled) {
    await disableAutoPasteBatch(true);
  } else {
    await enableAutoPasteBatch(true);
  }
}

async function initAutoPasteBatch() {
  updateAutoPasteBtn();
  bindAutoPasteEvents();
  if (autoPasteBatchEnabled) {
    await window.electronAPI.setBatchAutoPaste?.(true);
  } else {
    await window.electronAPI.setBatchAutoPaste?.(false);
  }
}

// ربط زر اللصق التلقائي
document.getElementById('autoPasteBatchBtn')?.addEventListener('click', toggleAutoPasteBatch);

// ─────────────────────────────────────────────────────────────────────────────

async function startBatchProcessing() {
  if (isQueueProcessing || downloadQueue.length === 0) return;
  isQueueProcessing = true;
  showStatus('بدء التحميل التلقائي لسلسلة الروابط...', 'info');
  await processNextBatchItem();
}

async function processNextBatchItem() {
  const item = downloadQueue.find((q) => q.status === 'pending');
  if (!item) {
    isQueueProcessing = false;
    updateQueueUI();
    showStatus('اكتمل تحميل كافة الروابط في السلسلة بنجاح!', 'success');
    return;
  }

  item.status = 'downloading';
  updateQueueUI();

  try {
    elements.videoUrl.value = item.url;
    const customType = item.type || selectedType || 'video-audio';
    const customHeight = item.quality || selectedHeight || 'best';
    const ext = customType === 'audio' ? '.mp3' : '.mp4';
    const finalFilename = item.filename ? `${item.filename}${ext}` : undefined;

    const options = {
      mode: 'full',
      format: null,
      height: customHeight,
      type: customType,
      hasAudio: customType !== 'video-only',
      filename: finalFilename,
      turbo: isTurboEnabled(),
      audioEnhance: isAudioEnhanceEnabled(),
      downloadDir: getStoredDownloadPath()
    };

    const result = await window.electronAPI.downloadVideo({
      url: item.url,
      options: options
    });

    if (result.success) {
      item.status = 'done';
    } else {
      item.status = 'error';
    }
  } catch (err) {
    console.error('Batch item error:', err);
    item.status = 'error';
  } finally {
    updateQueueUI();
    setTimeout(() => {
      processNextBatchItem();
    }, 1200);
  }
}

// Event Listeners
elements.fetchBtn.addEventListener('click', fetchVideoInfo);
elements.videoUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    fetchVideoInfo();
  }
});
elements.videoUrl.addEventListener('input', updateSearchControls);
elements.repairBtn?.addEventListener('click', repairApp);
elements.repairSettingsBtn?.addEventListener('click', repairApp);
elements.pasteBtn.addEventListener('click', pasteFromClipboard);
elements.settingsPasteBtn?.addEventListener('click', pasteFromClipboard);
elements.clearBtn.addEventListener('click', clearAll);
elements.downloadBtn.addEventListener('click', startDownload);
elements.settingsDownloadBtn?.addEventListener('click', startDownload);
elements.newDownloadBtn.addEventListener('click', newDownload);
elements.chooseDownloadFolderBtn?.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.selectDownloadFolder(getStoredDownloadPath());
    if (result.success && result.path) {
      localStorage.setItem(DEFAULT_DOWNLOAD_PATH_KEY, result.path);
      if (elements.defaultPathInput) {
        elements.defaultPathInput.value = result.path;
      }
      showStatus(t('pathUpdated') || 'تم تحديث مسار التحميل', 'success');
    }
  } catch (error) {
    showStatus(error.message, 'error');
  }
});
elements.openLastDownloadSidebarBtn?.addEventListener('click', () => {
  if (lastDownloadedPath) {
    window.electronAPI.showItemInFolder(lastDownloadedPath);
  } else {
    showStatus(t('historyEmptyTitle') || 'لا يوجد فيديو تم تحميله بعد', 'info');
  }
});




elements.playPreviewBtn?.addEventListener('click', () => toggleVideoPreview(false));
elements.refreshPreviewBtn?.addEventListener('click', () => toggleVideoPreview(true));
elements.closePreviewBtn?.addEventListener('click', () => {
  elements.previewVideoEl?.pause();
  elements.previewPlayerBox?.classList.add('hidden');
});

elements.batchToggleBtn?.addEventListener('click', () => {
  const isHidden = elements.batchQueuePanel?.classList.toggle('hidden');
  if (!isHidden) {
    elements.batchQueuePanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    elements.batchUrlsText?.focus();
  }
});
elements.closeBatchBtn?.addEventListener('click', () => {
  elements.batchQueuePanel?.classList.add('hidden');
});
elements.pasteAddBatchBtn?.addEventListener('click', pasteAndAddUrlsToQueue);
elements.startBatchBtn?.addEventListener('click', startBatchProcessing);
elements.clearBatchBtn?.addEventListener('click', clearBatchQueue);

const handleQuickPlay = () => {
  if (lastDownloadedPath) {
    window.electronAPI.openPath(lastDownloadedPath);
  }
};
elements.quickPlayBtn?.addEventListener('click', handleQuickPlay);
elements.settingsQuickPlayBtn?.addEventListener('click', handleQuickPlay);

// Navigation
elements.navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.section);
  });
});

// IPC event listeners
window.electronAPI.onStatus((data) => {
  showStatus(data.message, data.type);
});

window.electronAPI.onAppReady((data) => {
  if (data.ready) {
    setSearchEnabled(true, data);
    hideAppSplash();
    showStatus(t('appReady'), 'success');
  } else {
    updateSystemStatus('error', data);
    hideAppSplash();
  }
});

window.electronAPI.onDownloadProgress((data) => {
  handleDownloadProgress(data);
});

window.electronAPI.onDownloadDestination((data) => {
  handleDownloadDestination(data);
});

async function loadDefaultDownloadPath() {
  let savedPath = getStoredDownloadPath();

  if (!savedPath && window.electronAPI.getDownloadsPath) {
    try {
      savedPath = await window.electronAPI.getDownloadsPath();
    } catch {
      savedPath = '';
    }
  }

  if (elements.defaultPathInput && savedPath) {
    elements.defaultPathInput.value = savedPath;
    localStorage.setItem(DEFAULT_DOWNLOAD_PATH_KEY, savedPath);
  }
}

function bindClipboardEvents() {
  elements.clipboardAcceptBtn?.addEventListener('click', acceptClipboardUrl);
  elements.clipboardDismissBtn?.addEventListener('click', dismissClipboardUrl);

  window.electronAPI.onClipboardUrlDetected?.((data) => {
    // أثناء اللصق التلقائي للسلسلة لا نعرض نافذة البحث من الحافظة
    if (autoPasteBatchEnabled || !isClipboardWatchEnabled() || !data?.url) {
      return;
    }
    showClipboardPrompt(data.url);
  });
}

function bindSettingsEvents() {
  const turboCheckbox = document.getElementById('turboMode');
  const clearCacheBtn = document.getElementById('clearCacheBtn');
  const clipboardCheckbox = document.getElementById('clipboardAutoDetect');
  const notificationsCheckbox = document.getElementById('notifications');

  if (turboCheckbox) {
    turboCheckbox.checked = isTurboEnabled();
    turboCheckbox.addEventListener('change', () => {
      localStorage.setItem('turboMode', turboCheckbox.checked ? 'true' : 'false');
      showStatus(turboCheckbox.checked ? t('turboOn') : t('turboOff'), 'success');
    });
  }

  const audioEnhanceToggle = document.getElementById('audioEnhanceToggle');
  if (audioEnhanceToggle) {
    audioEnhanceToggle.checked = isAudioEnhanceEnabled();
    audioEnhanceToggle.addEventListener('change', () => {
      localStorage.setItem('audioEnhanceEnabled', audioEnhanceToggle.checked ? 'true' : 'false');
      showStatus(audioEnhanceToggle.checked ? t('audioEnhanceOn') : t('audioEnhanceOff'), 'success');
    });
  }

  if (elements.browsePathBtn) {
    elements.browsePathBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.selectDownloadFolder(getStoredDownloadPath());
        if (result.success && result.path) {
          localStorage.setItem(DEFAULT_DOWNLOAD_PATH_KEY, result.path);
          if (elements.defaultPathInput) {
            elements.defaultPathInput.value = result.path;
          }
        }
      } catch (error) {
        showStatus(error.message, 'error');
      }
    });
  }

  if (clipboardCheckbox) {
    clipboardCheckbox.checked = isClipboardWatchEnabled();
    clipboardCheckbox.addEventListener('change', async () => {
      const enabled = clipboardCheckbox.checked;
      localStorage.setItem(CLIPBOARD_WATCH_KEY, enabled ? 'true' : 'false');
      await window.electronAPI.setClipboardWatch?.(enabled);
      if (!enabled) {
        hideClipboardPrompt();
      }
    });
  }

  if (notificationsCheckbox) {
    notificationsCheckbox.checked = isNotificationsEnabled();
    notificationsCheckbox.addEventListener('change', () => {
      localStorage.setItem(NOTIFICATIONS_KEY, notificationsCheckbox.checked ? 'true' : 'false');
    });
  }

  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.value = window.i18n?.getLanguage?.() || 'ar';
    languageSelect.addEventListener('change', () => {
      const newLang = languageSelect.value;
      if (window.i18n?.setLanguage) {
        window.i18n.setLanguage(newLang);
        refreshUiAfterLanguageChange();
        showStatus(t('langChanged'), 'success');
      }
    });
  }

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      clientInfoCache.clear();
      await window.electronAPI.clearCache();
      showStatus(t('cacheCleared'), 'success');
    });
  }
}

function refreshUiAfterLanguageChange() {
  navigateTo(currentSection);
  updateDownloadButtonText();
  updateQualityHint();

  if (currentVideoInfo) {
    displayVideoInfo(currentVideoInfo, { preserveStudioMode: true });
  } else if (storedFormats) {
    refreshUnifiedQualityGrid(true);
  }

  updateHistoryUI();

  if (elements.statusMessage && !elements.statusBar.classList.contains('show')) {
    elements.statusMessage.textContent = t('statusIdle');
  }

  const badge = elements.systemStatusBadge;
  if (badge?.classList.contains('ready')) {
    updateSystemStatus('ready');
  } else if (badge?.classList.contains('error')) {
    updateSystemStatus('error');
  } else {
    updateSystemStatus('loading');
  }
  updateWelcomePanel();
}

async function initializeApp() {
  if (window.i18n) {
    const savedLang = window.i18n.getLanguage();
    window.i18n.setLanguage(savedLang);
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
      langSelect.value = savedLang;
      langSelect.addEventListener('change', () => {
        window.i18n.setLanguage(langSelect.value);
        refreshUiAfterLanguageChange();
        showStatus(t('langChanged'), 'success');
      });
    }
  }

  bindStudioEvents();
  bindClipboardEvents();
  bindSettingsEvents();
  await window.electronAPI.setClipboardWatch?.(isClipboardWatchEnabled());
  await loadDefaultDownloadPath();
  loadPlatforms();

  // تهيئة اللصق التلقائي للسلسلة (يتجاهل روابط الحافظة الموجودة قبل التفعيل)
  await initAutoPasteBatch();
  showStatus(t('initApp'), 'info');

  if (elements.statusMessage) {
    elements.statusMessage.textContent = t('statusIdle');
  }

  updateSystemStatus('loading');
  updateWelcomePanel();

  try {
    const status = await window.electronAPI.getAppStatus();
    if (status.ready) {
      setSearchEnabled(true, status);
      hideAppSplash();
      showStatus(t('appReady'), 'success');
    } else {
      updateSystemStatus('loading', status);
    }
  } catch (error) {
    updateSystemStatus('error');
    hideAppSplash();
    showStatus(t('errInitApp'), 'error');
  }

  window.setTimeout(hideAppSplash, 4500);
  elements.videoUrl.focus();
}

window.onLanguageChanged = () => {
  refreshUiAfterLanguageChange();
};

initializeApp();
