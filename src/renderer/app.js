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
let imageFormat = 'jpg';
let frameTime = 0;
let timelineRaf = null;
const clientInfoCache = new Map();
let storedFormats = null;
let downloadType = 'video-audio';
let dubMode = 'ai';
let dubLanguage = 'ar';
let currentSection = 'downloader';

let dubVoice = 'auto';
let dubSpeed = '1.0';
let dubSyncGap = '0.2';
let downloadQueue = [];
let isQueueProcessing = false;

const PREFERRED_DUB_LANGS = ['ar', 'ar-SA', 'ar-MA', 'ar-EG', 'ar-DZ', 'ar-SY', 'en', 'en-US', 'en-GB', 'fr', 'fr-FR', 'fr-CA'];
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
  dubWorkspace: document.getElementById('dubWorkspace'),
  dubModeCards: document.querySelectorAll('.dub-mode-card'),
  dubLanguageSelect: document.getElementById('dubLanguageSelect'),
  dubVoiceSelect: document.getElementById('dubVoiceSelect'),
  dubSpeedSelect: document.getElementById('dubSpeedSelect'),
  dubSyncSelect: document.getElementById('dubSyncSelect'),
  dubInfoBanner: document.getElementById('dubInfoBanner'),
  dubAvailability: document.getElementById('dubAvailability'),
  dubInfoText: document.getElementById('dubInfoText'),
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
  elements.frameTimeBadge.textContent = formatTimecode(0);

  buildTimelineRuler();
  updateTimelineUI();
}

function updateDownloadButtonText() {
  if (studioMode === 'clip') {
    elements.downloadBtnText.textContent = t('exportClip');
  } else if (studioMode === 'image') {
    elements.downloadBtnText.textContent = imageMode === 'thumbnail' ? t('downloadThumbnail') : t('extractFrame');
  } else if (studioMode === 'dub') {
    if (dubMode === 'ai') {
      elements.downloadBtnText.textContent = t('downloadAiDubbed');
    } else if (dubMode === 'subtitles') {
      elements.downloadBtnText.textContent = t('downloadWithSubs');
    } else {
      elements.downloadBtnText.textContent = t('downloadDubbed');
    }
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
  elements.dubWorkspace?.classList.toggle('active', mode === 'dub');
  elements.unifiedQualityPanel.classList.toggle('hidden', mode === 'image');
  elements.downloadTypeTabs.classList.toggle('hidden', mode === 'clip' || mode === 'dub');

  if (mode === 'image') {
    elements.frameControls.style.display = imageMode === 'frame' ? 'grid' : 'none';
  } else if (mode === 'dub') {
    downloadType = 'video-only';
    refreshUnifiedQualityGrid(true);
    updateDubAvailability();
  } else {
    refreshUnifiedQualityGrid();
  }

  updateQualityHint();
  updateDownloadButtonText();
}

function updateQualityHint() {
  if (studioMode === 'dub') {
    if (dubMode === 'ai') {
      elements.qualityHint.textContent = t('qualityHintAi');
    } else if (dubMode === 'subtitles') {
      elements.qualityHint.textContent = t('qualityHintSubs');
    } else {
      elements.qualityHint.textContent = t('qualityHintDub');
    }
    return;
  }

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

function getLangDisplayName(code) {
  const names = {
    'ar': 'العربية (الفصحى)',
    'ar-SA': 'العربية (اللهجة السعودية)',
    'ar-MA': 'العربية (اللهجة المغربية)',
    'ar-EG': 'العربية (اللهجة المصرية)',
    'ar-DZ': 'العربية (اللهجة الجزائرية)',
    'ar-SY': 'العربية (اللهجة الشامية)',
    'fr': 'Français (الفرنسية)',
    'fr-FR': 'Français (France)',
    'fr-CA': 'Français (Canada)',
    'en': 'English (الإلكترونية / الإنجليزية)',
    'en-US': 'English (US)',
    'en-GB': 'English (UK)'
  };
  return names[code] || code.toUpperCase();
}

function populateDubLanguages(info) {
  if (!elements.dubLanguageSelect) {
    return;
  }

  const sourceList = info.subtitleLanguages || info.audioLanguages || [];
  const availableCodes = new Set(sourceList.map((item) => item.code));
  const ordered = [];

  PREFERRED_DUB_LANGS.forEach((code) => {
    ordered.push(code);
  });

  sourceList.forEach((item) => {
    if (!ordered.includes(item.code)) {
      ordered.push(item.code);
    }
  });

  elements.dubLanguageSelect.innerHTML = ordered.map((code) => {
    const fromServer = sourceList.find((item) => item.code === code);
    const label = fromServer?.name || getLangDisplayName(code);
    return `<option value="${code}">${label}</option>`;
  }).join('');

  if (ordered.includes(dubLanguage)) {
    elements.dubLanguageSelect.value = dubLanguage;
  } else {
    dubLanguage = 'ar';
    elements.dubLanguageSelect.value = 'ar';
  }

  updateDubAvailability();
}

function updateDubAvailability() {
  if (!elements.dubAvailability || !currentVideoInfo) {
    return;
  }

  const langName = getLangDisplayName(dubLanguage);

  if (dubMode === 'dub_and_sub') {
    elements.dubAvailability.textContent = `جاهز للدبلجة الذكية والترجمة المدمجة إلى ${langName}`;
  } else if (dubMode === 'ai') {
    elements.dubAvailability.textContent = `جاهز للدبلجة الصوتية الذكية إلى ${langName}`;
  } else {
    elements.dubAvailability.textContent = `جاهز للترجمة النصية المطبوعة إلى ${langName}`;
  }
  elements.dubAvailability.className = 'dub-availability ok';

  if (elements.dubInfoBanner) {
    elements.dubInfoBanner.classList.toggle('subs-mode', dubMode === 'subtitles' || dubMode === 'ai' || dubMode === 'dub_and_sub');
  }

  if (elements.dubInfoText) {
    if (dubMode === 'dub_and_sub') {
      elements.dubInfoText.textContent = 'خيار دبلجة وترجمة معاً: يدمج بين صوت مدبلج بالذكاء الاصطناعي (مع حفظ الموسيقى والتأثيرات) والترجمة النصية المطبوعة خطياً على الفيديو باللغة المختارة';
    } else if (dubMode === 'ai') {
      elements.dubInfoText.textContent = t('dubAiInfo');
    } else if (dubMode === 'subtitles') {
      elements.dubInfoText.textContent = t('dubSubsInfo');
    } else {
      elements.dubInfoText.textContent = t('dubRemoveOriginal');
    }
  }
}

function setDubMode(mode) {
  dubMode = mode;
  elements.dubModeCards?.forEach((card) => {
    card.classList.toggle('active', card.dataset.dubMode === mode);
  });

  if (elements.dubVoiceRow) {
    elements.dubVoiceRow.classList.toggle('hidden', mode !== 'ai' && mode !== 'dub_and_sub');
  }

  const speedSyncRow = document.querySelector('.dub-speed-sync-grid');
  if (speedSyncRow) {
    speedSyncRow.classList.toggle('hidden', mode !== 'ai' && mode !== 'dub_and_sub');
  }

  if (currentVideoInfo) {
    populateDubLanguages(currentVideoInfo);
  }
  updateQualityHint();
  updateDownloadButtonText();
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
  const type = studioMode === 'dub' ? 'video-only' : getActiveDownloadType();

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
    const maxDuration = videoDuration || 1;
    clipStart = (Number(elements.clipStartRange.value) / 100) * maxDuration;
    if (clipStart >= clipEnd - 1) {
      clipStart = Math.max(0, clipEnd - 1);
    }
    scheduleTimelineUpdate();
  });

  elements.clipEndRange.addEventListener('input', () => {
    const maxDuration = videoDuration || 1;
    clipEnd = (Number(elements.clipEndRange.value) / 100) * maxDuration;
    if (clipEnd <= clipStart + 1) {
      clipEnd = Math.min(maxDuration, clipStart + 1);
    }
    scheduleTimelineUpdate();
  });

  elements.clipStartTime.addEventListener('change', () => {
    clipStart = parseTimecode(elements.clipStartTime.value);
    updateTimelineUI();
  });

  elements.clipEndTime.addEventListener('change', () => {
    clipEnd = parseTimecode(elements.clipEndTime.value);
    updateTimelineUI();
  });

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
      elements.frameControls.style.display = imageMode === 'frame' ? 'grid' : 'none';
      updateDownloadButtonText();
    });
  });

  elements.frameTimeRange.addEventListener('input', () => {
    frameTime = Number(elements.frameTimeRange.value) || 0;
    elements.frameTimeInput.value = formatTimecode(frameTime);
    elements.frameTimeBadge.textContent = formatTimecode(frameTime);
  }, { passive: true });

  elements.frameTimeInput.addEventListener('change', () => {
    frameTime = parseTimecode(elements.frameTimeInput.value);
    frameTime = Math.max(0, Math.min(frameTime, videoDuration || frameTime));
    elements.frameTimeRange.value = frameTime;
    elements.frameTimeInput.value = formatTimecode(frameTime);
    elements.frameTimeBadge.textContent = formatTimecode(frameTime);
  });

  elements.imageFormatPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      imageFormat = pill.dataset.format;
      elements.imageFormatPills.forEach((item) => item.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  elements.dubModeCards?.forEach((card) => {
    card.addEventListener('click', () => setDubMode(card.dataset.dubMode));
  });

  elements.dubLanguageSelect?.addEventListener('change', () => {
    dubLanguage = elements.dubLanguageSelect.value;
    updateDubAvailability();
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
  populateDubLanguages(info);

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
  if (mode === 'dub') {
    if (dubMode === 'ai') {
      return `${t('typeAiDubbed')} (${getLangDisplayName(dubLanguage)})`;
    }
    if (dubMode === 'subtitles') {
      return `${t('typeSubs')} (${getLangDisplayName(dubLanguage)})`;
    }
    return `${t('typeDubbed')} (${getLangDisplayName(dubLanguage)})`;
  }
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
  } else if (studioMode === 'dub') {
    if (!selectedFormat || !selectedHeight) {
      showStatus(t('errSelectQuality'), 'error');
      return;
    }

    if (!dubLanguage) {
      showStatus(t('errSelectDubLang'), 'error');
      return;
    }

    downloadOptions = {
      mode: 'dub',
      dubMode,
      dubLanguage,
      dubVoice,
      dubSpeed,
      dubSyncGap,
      originalLanguage: currentVideoInfo.originalLanguage,
      format: selectedFormat,
      height: selectedHeight,
      type: 'video-only',
      filename: `${filename}.mp4`
    };
    historyType = dubMode === 'subtitles' ? 'subtitles' : (dubMode === 'ai' ? 'ai-dubbed' : (dubMode === 'dub_and_sub' ? 'dub-and-sub' : 'dubbed'));
    if (dubMode === 'dub_and_sub') {
      progressMessage = `جاري الدبلجة الصوتية والترجمة النصية المدمجة مع حفظ الموسيقى (${getLangDisplayName(dubLanguage)})...`;
    } else if (dubMode === 'ai') {
      progressMessage = `${t('progressAiDub')} (${getLangDisplayName(dubLanguage)})...`;
    } else if (dubMode === 'subtitles') {
      progressMessage = `${t('progressSubs')} (${getLangDisplayName(dubLanguage)})...`;
    } else {
      progressMessage = `${t('progressDub')} (${getLangDisplayName(dubLanguage)})...`;
    }
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
    settings: t('pageSettings')
  };
  elements.pageTitle.textContent = titles[section] || 'VM';
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
  dubMode = 'dub';
  dubLanguage = 'ar';
  elements.dubModeCards?.forEach((card, index) => {
    card.classList.toggle('active', index === 0);
  });
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
  if (studioMode === 'dub') {
    return `استوديو الإنتاج [دبلجة وترجمة: ${getLangDisplayName(dubLanguage)} | صوت: ${dubVoice} | سرعة: ${dubSpeed}x]`;
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

        // 3. Production Studio: Dubbing & Subtitles Mode
        if (studioMode === 'dub') {
          window.electronAPI.getPreviewSubtitles({ url, language: dubLanguage }).then((subRes) => {
            if (subRes.success && subRes.vttContent) {
              const blob = new Blob([subRes.vttContent], { type: 'text/vtt;charset=utf-8' });
              currentSubBlobUrl = URL.createObjectURL(blob);
              const track = document.createElement('track');
              track.kind = 'subtitles';
              track.label = `ترجمة (${getLangDisplayName(dubLanguage)})`;
              track.srclang = dubLanguage.split('-')[0];
              track.src = currentSubBlobUrl;
              track.default = true;
              elements.previewVideoEl.appendChild(track);

              if (elements.previewVideoEl.textTracks && elements.previewVideoEl.textTracks[0]) {
                elements.previewVideoEl.textTracks[0].mode = 'showing';
              }
              showStatus(`تم تطبيق تعديلات الدبلجة والترجمة (${getLangDisplayName(dubLanguage)}) على المعاينة`, 'success');
            }
          }).catch(() => {});
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
function updateQueueUI() {
  if (!elements.batchQueueList) return;
  if (downloadQueue.length === 0) {
    elements.batchQueueList.innerHTML = `<p class="batch-desc">${t('batchDesc')}</p>`;
    if (elements.startBatchBtn) elements.startBatchBtn.disabled = true;
    return;
  }

  const pendingCount = downloadQueue.filter((q) => q.status === 'pending').length;
  const doneCount = downloadQueue.filter((q) => q.status === 'done').length;
  if (elements.startBatchBtn) elements.startBatchBtn.disabled = isQueueProcessing || pendingCount === 0;

  const headerHtml = `<div class="batch-queue-summary" style="margin-bottom: 10px; font-size: 13px; color: var(--primary-light); font-weight: 600;">سلسلة الروابط بدون سقف: إجمالي <strong>${downloadQueue.length} فيديو</strong> (اكتمل: ${doneCount} | المتبقي: ${pendingCount})</div>`;

  const itemsHtml = downloadQueue.map((item, idx) => `
    <div class="batch-item ${item.status}">
      <span class="batch-item-url" title="${escapeHtml(item.url)}">${idx + 1}. ${escapeHtml(item.url)}</span>
      <span class="batch-item-status ${item.status}">
        ${item.status === 'pending' ? 'انتظار' : item.status === 'downloading' ? 'جاري التحميل...' : item.status === 'done' ? 'اكتمل ✓' : 'خطأ ✗'}
      </span>
    </div>
  `).join('');

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
        downloadQueue.push({ url: urlStr, status: 'pending' });
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
  downloadQueue = [];
  updateQueueUI();
  showStatus('تم إفراغ قائمة التحميل المتتالي', 'info');
}

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
    await fetchVideoInfo();
    await startDownload();
    item.status = 'done';
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

elements.dubVoiceSelect?.addEventListener('change', () => {
  dubVoice = elements.dubVoiceSelect.value;
});

elements.dubSpeedSelect?.addEventListener('change', () => {
  dubSpeed = elements.dubSpeedSelect.value;
});

elements.dubSyncSelect?.addEventListener('change', () => {
  dubSyncGap = elements.dubSyncSelect.value;
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
    if (!isClipboardWatchEnabled() || !data?.url) {
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
  updateDubAvailability();

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
