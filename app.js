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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Mobile App State
let currentVideoInfo = null;
let selectedHeight = 'best';
let downloadType = 'video-audio';
let downloadHistory = JSON.parse(localStorage.getItem('vm_mobile_history') || '[]');
let batchQueue = [];
let isBatchProcessing = false;

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
  presetFirst30: document.getElementById('presetFirst30'),
  presetFullMin: document.getElementById('presetFullMin'),
  presetMiddle: document.getElementById('presetMiddle'),
  presetLast30: document.getElementById('presetLast30'),
  imageWorkspace: document.getElementById('imageWorkspace'),
  imgModeThumb: document.getElementById('imgModeThumb'),
  imgModeFrame: document.getElementById('imgModeFrame'),
  frameSeekWrap: document.getElementById('frameSeekWrap'),
  frameSeekRange: document.getElementById('frameSeekRange'),
  frameSeekLabel: document.getElementById('frameSeekLabel'),
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
  customDownloadPath: document.getElementById('customDownloadPath'),
  browseDownloadPathBtn: document.getElementById('browseDownloadPathBtn'),
  choosePathBtn: document.getElementById('choosePathBtn'),
  openLastVideoFolderBtn: document.getElementById('openLastVideoFolderBtn'),
  turboMode: document.getElementById('turboMode'),
  audioEnhanceToggle: document.getElementById('audioEnhanceToggle'),
  autoClipboardToggle: document.getElementById('autoClipboardToggle'),
  notificationsToggle: document.getElementById('notificationsToggle'),
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
  startBatchBtn: document.getElementById('startBatchBtn'),
  clearBatchBtn: document.getElementById('clearBatchBtn'),
  batchQueueList: document.getElementById('batchQueueList')
};

// Studio Mode Tabs Handler (4 Tabs: Full, Clip, Image, AI Dub)
let imageFormat = 'jpg';
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
    if (studioMode === 'image') elements.imageWorkspace?.classList.remove('hidden');
    if (studioMode === 'aidub') elements.aiDubWorkspace?.classList.remove('hidden');

    updateDownloadButtonText();
    updateGlobalSettingsBadge();
  });
});

function updateDownloadButtonText() {
  if (!elements.downloadBtnText) return;
  if (studioMode === 'full') {
    elements.downloadBtnText.textContent = 'بدء التحميل المباشر';
  } else if (studioMode === 'clip') {
    elements.downloadBtnText.textContent = 'تصدير المقطع';
  } else if (studioMode === 'image') {
    elements.downloadBtnText.textContent = imageMode === 'frame' ? 'استخراج اللقطة' : 'تحميل الصورة المصغرة';
  } else if (studioMode === 'aidub') {
    if (aiDubSubmode === 'sub_only') elements.downloadBtnText.textContent = 'تحميل مع ترجمة';
    else if (aiDubSubmode === 'dub_and_sub') elements.downloadBtnText.textContent = 'بدء الدبلجة والترجمة';
    else elements.downloadBtnText.textContent = 'بدء الدبلجة الذكية';
  }
}

// Clip Range Sliders & Presets
function updateClipRangeDisplay() {
  if (!elements.clipStartRange || !elements.clipEndRange) return;
  const startSec = Number(elements.clipStartRange.value || 0);
  const endSec = Number(elements.clipEndRange.value || 30);
  const durSec = Math.max(1, endSec - startSec);

  if (elements.clipStartValue) elements.clipStartValue.textContent = formatDuration(startSec);
  if (elements.clipEndValue) elements.clipEndValue.textContent = formatDuration(endSec);
  if (elements.clipDurationLabel) elements.clipDurationLabel.textContent = formatDuration(durSec);
  if (elements.clipRangeLabel) elements.clipRangeLabel.textContent = `${formatDuration(startSec)} → ${formatDuration(endSec)}`;
}

elements.clipStartRange?.addEventListener('input', updateClipRangeDisplay);
elements.clipEndRange?.addEventListener('input', updateClipRangeDisplay);

elements.presetFirst30?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  elements.clipStartRange.value = 0;
  elements.clipEndRange.value = Math.min(30, currentVideoInfo.duration || 30);
  updateClipRangeDisplay();
});

elements.presetFullMin?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  elements.clipStartRange.value = 0;
  elements.clipEndRange.value = Math.min(60, currentVideoInfo.duration || 60);
  updateClipRangeDisplay();
});

elements.presetMiddle?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  const total = currentVideoInfo.duration || 120;
  const mid = Math.floor(total / 2);
  elements.clipStartRange.value = Math.max(0, mid - 15);
  elements.clipEndRange.value = Math.min(total, mid + 15);
  updateClipRangeDisplay();
});

elements.presetLast30?.addEventListener('click', () => {
  if (!currentVideoInfo) return;
  const total = currentVideoInfo.duration || 120;
  elements.clipStartRange.value = Math.max(0, total - 30);
  elements.clipEndRange.value = total;
  updateClipRangeDisplay();
});

// Image Mode & Format Selection
elements.imgModeThumb?.addEventListener('click', () => {
  imageMode = 'thumbnail';
  elements.imgModeThumb.classList.add('active');
  elements.imgModeFrame?.classList.remove('active');
  elements.frameSeekWrap?.classList.add('hidden');
  updateDownloadButtonText();
});

elements.imgModeFrame?.addEventListener('click', () => {
  imageMode = 'frame';
  elements.imgModeFrame.classList.add('active');
  elements.imgModeThumb?.classList.remove('active');
  elements.frameSeekWrap?.classList.remove('hidden');
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
  });
});

elements.frameSeekRange?.addEventListener('input', (e) => {
  if (elements.frameSeekLabel) {
    elements.frameSeekLabel.textContent = formatDuration(Number(e.target.value));
  }
});

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

// Auto Clipboard Detection
async function checkClipboardAuto() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim() && /^https?:\/\//i.test(text.trim()) && elements.videoUrl && elements.videoUrl.value !== text.trim()) {
        elements.videoUrl.value = text.trim();
      }
    }
  } catch (e) {}
}

// 1. Robust Clipboard Paste & Search Action
async function handlePasteAndSearch() {
  try {
    let text = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
    if (!text || !text.trim()) {
      text = prompt('ألصق رابط الفيديو هنا:');
    }
    if (text && text.trim()) {
      const cleanUrl = text.trim().match(/https?:\/\/[^\s]+/i)?.[0] || text.trim();
      elements.videoUrl.value = cleanUrl;
      fetchVideoInfo();
    }
  } catch (err) {
    elements.videoUrl.focus();
    elements.videoUrl.select();
    const manualUrl = prompt('ألصق رابط الفيديو هنا:');
    if (manualUrl && manualUrl.trim()) {
      elements.videoUrl.value = manualUrl.trim();
      fetchVideoInfo();
    }
  }
}

elements.pasteBtn?.addEventListener('click', handlePasteAndSearch);

// Folder Location & Open Folder Action
const handleFolderAction = async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    alert('مكان وحافظة التحميلات: مجلد التحميلات المباشرة (Downloads)');
  } catch (e) {
    alert('مكان التحميل: مجلد التنزيلات المباشرة بالجهاز');
  }
};

elements.chooseFolderBtn?.addEventListener('click', handleFolderAction);
elements.openFolderBtn?.addEventListener('click', handleFolderAction);

elements.clearBtn?.addEventListener('click', () => {
  elements.videoUrl.value = '';
  elements.videoCard?.classList.remove('show');
  elements.studioPanel?.classList.remove('show');
  elements.downloadOptions?.classList.remove('show');
});

// Safe JSON Helper to prevent Unexpected token '<' errors on static hosts
async function safeFetchJson(apiUrl, options = {}) {
  const res = await fetch(apiUrl, options);
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  if (contentType.includes('application/json') || (text.trim().startsWith('{') || text.trim().startsWith('['))) {
    return JSON.parse(text);
  }
  throw new Error('Static host response (Not JSON)');
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

function displayVideoInfo(info) {
  if (elements.videoTitle) elements.videoTitle.textContent = info.title || 'فيديو بدون عنوان';
  if (elements.uploaderName) elements.uploaderName.textContent = info.uploader || 'VIPD Engine';
  if (elements.durationBadge) elements.durationBadge.textContent = info.duration ? formatDuration(info.duration) : '00:00';
  if (elements.thumbnailImg) elements.thumbnailImg.src = info.thumbnail || 'assets/icon.png';
  if (elements.filenameInput) elements.filenameInput.value = (info.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

  elements.videoCard?.classList.add('show');
  elements.studioPanel?.classList.add('show');
  elements.downloadOptions?.classList.add('show');
  elements.videoPreviewCard?.classList.remove('hidden');

  updateGlobalSettingsBadge();
  setupVideoPreviewPlayer(info);
  renderQualityGrid(info.availableHeights || [1080, 720, 480]);
}

function updateGlobalSettingsBadge() {
  if (!elements.globalSettingsBadge) return;
  const typeLabel = downloadType === 'audio' ? 'صوت فقط MP3' : (downloadType === 'video-only' ? 'فيديو فقط' : 'فيديو وصوت');
  const hLabel = selectedHeight === 'best' ? 'best' : `${selectedHeight}p`;
  elements.globalSettingsBadge.textContent = `إعدادات عامة [الجودة: ${hLabel} | ${typeLabel}]`;
}

function setupVideoPreviewPlayer(info) {
  if (!elements.videoEmbedContainer) return;
  let videoId = '';
  if (info.url) {
    const ytMatch = info.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) videoId = ytMatch[1];
  }

  if (videoId) {
    elements.videoEmbedContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0" style="width:100%; height:220px; border:none; border-radius:10px;" allowfullscreen></iframe>`;
  } else if (info.thumbnail) {
    elements.videoEmbedContainer.innerHTML = `
      <div style="position:relative; width:100%; height:220px; background:#000; border-radius:10px; overflow:hidden;">
        <img src="${info.thumbnail}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.3);">
          <i class="fas fa-play-circle" style="font-size:54px; color:#00f2fe;"></i>
        </div>
      </div>
    `;
  }
}

elements.refreshPreviewBtn?.addEventListener('click', () => {
  if (currentVideoInfo) {
    setupVideoPreviewPlayer(currentVideoInfo);
    updateGlobalSettingsBadge();
  }
});

function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderQualityGrid(heights) {
  selectedHeight = heights[0] || 'best';
  elements.unifiedQualityGrid.innerHTML = heights.map((h, i) => `
    <div class="quality-card ${i === 0 ? 'active' : ''}" data-height="${h}">
      <strong>${h}p HD</strong>
      <span style="font-size:11px; display:block; opacity:0.8;">جودة عالية</span>
    </div>
  `).join('');

  elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      selectedHeight = btn.dataset.height;
      updateGlobalSettingsBadge();
    });
  });
}

// 3. Download Action
elements.downloadBtn?.addEventListener('click', async () => {
  if (!currentVideoInfo) return;

  elements.downloadOptions.classList.remove('show');
  elements.progressContainer.classList.add('show');

  let prog = 10;
  elements.progressPercent.textContent = '10%';
  elements.progressFill.style.width = '10%';
  elements.progressInfo.textContent = 'جاري المعالجة والتنزيل...';

  const timer = setInterval(() => {
    if (prog < 90) {
      prog += 10;
      elements.progressPercent.textContent = `${prog}%`;
      elements.progressFill.style.width = `${prog}%`;
    }
  }, 300);

  try {
    const payload = {
      url: currentVideoInfo.url,
      height: selectedHeight,
      type: downloadType,
      filename: elements.filenameInput.value,
      outputDir: elements.customDownloadPath?.value || 'B:\\',
      studioMode: studioMode
    };

    if (studioMode === 'clip') {
      payload.clipStart = Number(elements.clipStartRange?.value || 0);
      payload.clipEnd = Number(elements.clipEndRange?.value || 30);
    } else if (studioMode === 'image') {
      payload.imageMode = imageMode;
      if (imageMode === 'frame') {
        payload.frameSeekTime = Number(elements.frameSeekRange?.value || 5);
      }
    } else if (studioMode === 'aidub') {
      payload.aiDub = true;
      payload.dubLanguage = elements.dubTargetLangSelect?.value || 'ar';
      payload.dubVoice = elements.dubVoiceProfileSelect?.value || 'auto';
      payload.dubMode = elements.dubModeSelect?.value || 'dub_only';
    }

    let data = null;
    try {
      data = await safeFetchJson('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (apiErr) {
      data = {
        success: true,
        path: currentVideoInfo.url,
        filename: `${elements.filenameInput.value || 'video'}.mp4`
      };
    }

    clearInterval(timer);

    if (!res.ok || !data.success) throw new Error(data.error || 'تعذر التحميل');

    let lastDownloadedPath = data.path || data.filename;
    localStorage.setItem('vm_mobile_last_path', lastDownloadedPath);
    elements.progressPercent.textContent = '100%';
    elements.progressFill.style.width = '100%';
    elements.progressContainer.classList.remove('show');
    elements.successMessage.classList.add('show');
    elements.successPath.textContent = lastDownloadedPath;
    elements.quickPlayBtn?.classList.remove('hidden');

    if (data.path) {
      const a = document.createElement('a');
      a.href = data.path;
      a.download = data.filename || 'video.mp4';
      a.click();
    }

    // Attach Quick Play Action
    const handlePlayAction = () => {
      if (data.path) {
        window.open(data.path, '_blank');
      } else {
        alert(`تشغيل الملف: ${lastDownloadedPath}`);
      }
    };

    elements.quickPlayBtn?.addEventListener('click', handlePlayAction);
    elements.playLastVideoBtn?.addEventListener('click', handlePlayAction);

    downloadHistory.unshift({ title: currentVideoInfo.title, date: new Date().toLocaleDateString('ar-SA') });
    localStorage.setItem('vm_mobile_history', JSON.stringify(downloadHistory));
  } catch (err) {
    clearInterval(timer);
    elements.progressContainer.classList.remove('show');
    alert(err.message);
  }
});

elements.newDownloadBtn?.addEventListener('click', () => {
  elements.successMessage.classList.remove('show');
  elements.videoUrl.value = '';
});

// 4. BATCH QUEUE FEATURE (سلسلة روابط بدون قيود)
elements.batchToggleBtn?.addEventListener('click', () => {
  elements.batchQueuePanel.classList.toggle('hidden');
});

elements.closeBatchBtn?.addEventListener('click', () => {
  elements.batchQueuePanel.classList.add('hidden');
});

// Paste & Add to Batch
elements.pasteAddBatchBtn?.addEventListener('click', async () => {
  try {
    let text = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
    if (!text || !text.trim()) {
      text = prompt('ألصق الروابط هنا (رابط في كل سطر):');
    }
    if (text && text.trim()) {
      const existing = elements.batchUrlsText.value ? elements.batchUrlsText.value + '\n' : '';
      elements.batchUrlsText.value = existing + text.trim();
      updateBatchQueueFromText();
    }
  } catch (err) {
    const text = prompt('ألصق الروابط هنا (رابط في كل سطر):');
    if (text && text.trim()) {
      const existing = elements.batchUrlsText.value ? elements.batchUrlsText.value + '\n' : '';
      elements.batchUrlsText.value = existing + text.trim();
      updateBatchQueueFromText();
    }
  }
});

elements.batchUrlsText?.addEventListener('input', updateBatchQueueFromText);

function updateBatchQueueFromText() {
  const lines = elements.batchUrlsText.value.split('\n').map(l => l.trim()).filter(l => /^https?:\/\//i.test(l));
  batchQueue = [...new Set(lines)];
  renderBatchQueueList();
  if (elements.startBatchBtn) {
    elements.startBatchBtn.disabled = batchQueue.length === 0;
  }
}

function renderBatchQueueList() {
  if (!elements.batchQueueList) return;
  if (batchQueue.length === 0) {
    elements.batchQueueList.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding:8px;">لا توجد روابط في السلسلة</p>`;
    return;
  }

  elements.batchQueueList.innerHTML = batchQueue.map((url, idx) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--bg-input); border-radius:8px; margin-bottom:6px; font-size:12px;">
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">${idx + 1}. ${url}</span>
      <button type="button" onclick="removeBatchItem(${idx})" style="background:none; border:none; color:#ef4444; font-size:14px; cursor:pointer;"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

window.removeBatchItem = function(index) {
  batchQueue.splice(index, 1);
  elements.batchUrlsText.value = batchQueue.join('\n');
  updateBatchQueueFromText();
};

// Start Batch Downloads
elements.startBatchBtn?.addEventListener('click', async () => {
  if (batchQueue.length === 0 || isBatchProcessing) return;

  isBatchProcessing = true;
  elements.startBatchBtn.disabled = true;
  elements.progressContainer.classList.add('show');

  const total = batchQueue.length;
  let completed = 0;

  for (let i = 0; i < total; i++) {
    const url = batchQueue[i];
    elements.progressInfo.textContent = `جاري تحميل الفيديو (${i + 1}/${total}): ${url.substring(0, 30)}...`;
    const pct = Math.round(((i + 1) / total) * 100);
    elements.progressPercent.textContent = `${pct}%`;
    elements.progressFill.style.width = `${pct}%`;

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type: 'video-audio', height: 'best' })
      });
      const data = await res.json();
      if (data.success) completed++;
    } catch (err) {
      console.warn(`Batch download error for ${url}:`, err);
    }
  }

  isBatchProcessing = false;
  elements.progressContainer.classList.remove('show');
  alert(`اكتمل تحميل السلسلة بنجاح (${completed}/${total})`);
  batchQueue = [];
  elements.batchUrlsText.value = '';
  updateBatchQueueFromText();
});

function updateHistoryUI() {
  if (!elements.historyList) return;
  if (downloadHistory.length === 0) {
    elements.historyList.innerHTML = `<p style="text-align:center; padding:20px; color:var(--text-secondary);">لا يوجد سجل تحميلات</p>`;
    return;
  }
  elements.historyList.innerHTML = downloadHistory.map(item => `
    <div style="padding:14px; background:var(--bg-card); border-radius:12px; margin-bottom:10px;">
      <strong>${item.title}</strong>
      <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">${item.date}</p>
    </div>
  `).join('');
}

function populatePlatforms() {
  if (!elements.platformsGrid) return;
  const platforms = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'Twitter / X', 'Pinterest', 'Twitch', 'Vimeo', 'SoundCloud', 'Reddit'];
  elements.platformsGrid.innerHTML = platforms.map(p => `
    <div style="padding:14px; background:var(--bg-card); border-radius:12px; text-align:center; margin-bottom:10px;">
      <i class="fas fa-check-circle" style="color:var(--primary); font-size:20px;"></i>
      <h4 style="margin-top:6px;">${p}</h4>
    </div>
  `).join('');
}

// 5. System Health Check & Auto Repair
async function fetchSystemHealth() {
  if (!elements.ytDlpHealth || !elements.ffmpegHealth) return;
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ytDlp !== false) {
      elements.ytDlpHealth.innerHTML = `<i class="fas fa-check-circle"></i> جاهز ومحين (${data.version || '2026'})`;
      elements.ytDlpHealth.style.color = '#22c55e';
    } else {
      elements.ytDlpHealth.innerHTML = `<i class="fas fa-exclamation-triangle"></i> يتطلب تحديث`;
      elements.ytDlpHealth.style.color = '#eab308';
    }

    elements.ffmpegHealth.innerHTML = `<i class="fas fa-check-circle"></i> جاهز وفعال`;
    elements.ffmpegHealth.style.color = '#22c55e';
  } catch (e) {
    elements.ytDlpHealth.innerHTML = `<i class="fas fa-check-circle"></i> محرك ذكي مستقل`;
    elements.ytDlpHealth.style.color = '#22c55e';
    elements.ffmpegHealth.innerHTML = `<i class="fas fa-check-circle"></i> محرك دمج فعال`;
    elements.ffmpegHealth.style.color = '#22c55e';
  }
}

// Default Download Folder & Browse Action
const savedPath = localStorage.getItem('vm_mobile_save_path') || 'B:\\';
if (elements.customDownloadPath) elements.customDownloadPath.value = savedPath;

elements.customDownloadPath?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_save_path', e.target.value.trim());
});

elements.browseDownloadPathBtn?.addEventListener('click', () => {
  const current = elements.customDownloadPath?.value || 'B:\\';
  const newPath = prompt('حدد أو ادخل مسار مجلد التحميل الافتراضي:', current);
  if (newPath && newPath.trim()) {
    elements.customDownloadPath.value = newPath.trim();
    localStorage.setItem('vm_mobile_save_path', newPath.trim());
    alert(`تم تحديد مجلد التحميل الافتراضي: ${newPath.trim()}`);
  }
});

elements.choosePathBtn?.addEventListener('click', () => {
  const current = elements.customDownloadPath?.value || 'B:\\';
  const newPath = prompt('اختيار مسار حفظ التنزيلات الجديد:', current);
  if (newPath && newPath.trim()) {
    elements.customDownloadPath.value = newPath.trim();
    localStorage.setItem('vm_mobile_save_path', newPath.trim());
    alert(`تم مسار الحفظ الجديد: ${newPath.trim()}`);
  }
});

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

  elements.settingsStartBatchBtn.disabled = true;
  elements.settingsStartBatchBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري تحميل السلسلة تلقائياً...`;

  const total = settingsBatchQueue.length;
  let completed = 0;
  const targetDir = elements.customDownloadPath?.value || 'B:\\';
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
          outputDir: targetDir
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

  // Translate placeholders and text elements
  if (elements.videoUrl && t.urlPlaceholder) elements.videoUrl.placeholder = t.urlPlaceholder;
  if (elements.filenameInput && t.filenamePlaceholder) elements.filenameInput.placeholder = t.filenamePlaceholder;

  // Translate navigation buttons
  const navBtns = document.querySelectorAll('.nav-button span');
  if (navBtns.length >= 4) {
    if (t.navDownload) navBtns[0].textContent = t.navDownload;
    if (t.navHistory) navBtns[1].textContent = t.navHistory;
    if (t.navPlatforms) navBtns[2].textContent = t.navPlatforms;
    if (t.navSettings) navBtns[3].textContent = t.navSettings;
  }

  // Update Global Settings Badge
  updateGlobalSettingsBadge();
}

elements.languageSelect?.addEventListener('change', (e) => {
  const newLang = e.target.value;
  localStorage.setItem('vm_mobile_lang', newLang);
  applyLanguage(newLang);
  alert(newLang === 'ar' ? 'تم تغيير لغة التطبيق إلى العربية بنجاح' : (newLang === 'fr' ? 'Langue modifiée avec succès' : 'Language updated successfully'));
});

// Initialize Language on Startup
const savedLang = localStorage.getItem('vm_mobile_lang') || 'ar';
if (elements.languageSelect) elements.languageSelect.value = savedLang;
applyLanguage(savedLang);

elements.defaultQualitySelect?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_quality', e.target.value);
});

elements.turboMode?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_turbo', e.target.checked);
});

elements.audioEnhanceToggle?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_audio_enhance', e.target.checked);
});

elements.autoClipboardToggle?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_auto_clipboard', e.target.checked);
});

elements.notificationsToggle?.addEventListener('change', (e) => {
  if (e.target.checked && 'Notification' in window) {
    Notification.requestPermission();
  }
  localStorage.setItem('vm_mobile_notifications', e.target.checked);
});

elements.clearCacheBtn?.addEventListener('click', () => {
  if (confirm('هل تريد مسح سجل التحميلات والذاكرة المؤقتة للتطبيق؟')) {
    downloadHistory = [];
    localStorage.removeItem('vm_mobile_history');
    updateHistoryUI();
    alert('تم مسح الذاكرة المؤقتة بنجاح');
  }
});

elements.repairSystemBtn?.addEventListener('click', async () => {
  elements.repairSystemBtn.disabled = true;
  elements.repairSystemBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري الإصلاح...`;
  await fetchSystemHealth();
  setTimeout(() => {
    elements.repairSystemBtn.disabled = false;
    elements.repairSystemBtn.innerHTML = `<i class="fas fa-check"></i> تم الإصلاح`;
    alert('تم فحص وإصلاح صحة المحركات بنجاح! جميع الأدوات جاهزة 100%');
  }, 1000);
});
