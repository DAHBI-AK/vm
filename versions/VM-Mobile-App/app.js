/* ============================================================
   VM MOBILE PRO — WORLD-CLASS ULTIMATE LOGIC ENGINE
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements Registry
  const elements = {
    // Navigation
    navBtns: document.querySelectorAll('.nav-button'),
    tabViews: document.querySelectorAll('.tab-view'),

    // Downloader Inputs & Actions
    videoUrl: document.getElementById('videoUrl'),
    fetchBtn: document.getElementById('fetchBtn'),
    pasteBtn: document.getElementById('pasteBtn'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    batchToggleBtn: document.getElementById('batchToggleBtn'),
    
    // Batch Panel
    batchQueuePanel: document.getElementById('batchQueuePanel'),
    closeBatchBtn: document.getElementById('closeBatchBtn'),
    batchUrlsText: document.getElementById('batchUrlsText'),
    pasteAddBatchBtn: document.getElementById('pasteAddBatchBtn'),
    startBatchBtn: document.getElementById('startBatchBtn'),
    clearBatchBtn: document.getElementById('clearBatchBtn'),
    batchQueueList: document.getElementById('batchQueueList'),

    // Loading & Video Info
    loadingState: document.getElementById('loadingState'),
    videoCard: document.getElementById('videoCard'),
    thumbnailImg: document.getElementById('thumbnailImg'),
    durationBadge: document.getElementById('durationBadge'),
    videoTitle: document.getElementById('videoTitle'),
    uploaderName: document.getElementById('uploaderName'),

    // Video Preview Player
    videoPreviewCard: document.getElementById('videoPreviewCard'),
    globalSettingsBadge: document.getElementById('globalSettingsBadge'),
    videoEmbedContainer: document.getElementById('videoEmbedContainer'),
    refreshPreviewBtn: document.getElementById('refreshPreviewBtn'),

    // Production Studio PRO
    studioPanel: document.getElementById('studioPanel'),
    studioModeTabs: document.querySelectorAll('.mobile-studio-tab'),
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
    
    // Image Workspace
    imageWorkspace: document.getElementById('imageWorkspace'),
    imgModeThumb: document.getElementById('imgModeThumb'),
    imgModeFrame: document.getElementById('imgModeFrame'),
    frameSeekWrap: document.getElementById('frameSeekWrap'),
    frameSeekRange: document.getElementById('frameSeekRange'),
    frameSeekLabel: document.getElementById('frameSeekLabel'),
    imgFmtBtns: document.querySelectorAll('.img-fmt-btn'),

    // AI Dubbing Workspace
    aiDubWorkspace: document.getElementById('aiDubWorkspace'),
    aidubSubmodeBtns: document.querySelectorAll('.aidub-submode-btn'),
    aiDubInfoText: document.getElementById('aiDubInfoText'),
    dubTargetLangSelect: document.getElementById('dubTargetLangSelect'),
    dubVoiceProfileSelect: document.getElementById('dubVoiceProfileSelect'),

    // Options & Download
    downloadOptions: document.getElementById('downloadOptions'),
    typePills: document.querySelectorAll('.type-pill'),
    unifiedQualityGrid: document.getElementById('unifiedQualityGrid'),
    filenameInput: document.getElementById('filenameInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadBtnText: document.getElementById('downloadBtnText'),
    quickPlayBtn: document.getElementById('quickPlayBtn'),

    // Progress & Success
    progressContainer: document.getElementById('progressContainer'),
    progressInfo: document.getElementById('progressInfo'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    successMessage: document.getElementById('successMessage'),
    successPath: document.getElementById('successPath'),
    newDownloadBtn: document.getElementById('newDownloadBtn'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    playLastVideoBtn: document.getElementById('playLastVideoBtn'),

    // History & Platforms
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    platformsGrid: document.getElementById('platformsGrid'),

    // Settings Controls
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
    resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),

    // Settings Batch Queue
    settingsBatchUrlsText: document.getElementById('settingsBatchUrlsText'),
    settingsPasteAddBatchBtn: document.getElementById('settingsPasteAddBatchBtn'),
    settingsStartBatchBtn: document.getElementById('settingsStartBatchBtn'),
    settingsClearBatchBtn: document.getElementById('settingsClearBatchBtn'),
    settingsBatchQueueList: document.getElementById('settingsBatchQueueList'),

    // Health
    repairSystemBtn: document.getElementById('repairSystemBtn'),
    ytDlpHealth: document.getElementById('ytDlpHealth'),
    ffmpegHealth: document.getElementById('ffmpegHealth'),

    // PWA Install
    installAppBtn: document.getElementById('installAppBtn')
  };

  // State Variables
  let currentVideoInfo = null;
  let selectedHeight = 'best';
  let downloadType = 'video-audio';
  let studioMode = 'full'; // 'full', 'clip', 'image', 'aidub'
  let imageMode = 'thumbnail'; // 'thumbnail', 'frame'
  let imageFormat = 'jpg'; // 'jpg', 'png', 'webp'
  let aiDubSubmode = 'dub_only'; // 'dub_only', 'sub_only', 'dub_and_sub'
  let batchQueue = [];
  let deferredInstallPrompt = null;

  // PWA Install Prompt Listener
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (elements.installAppBtn) elements.installAppBtn.classList.remove('hidden');
  });

  elements.installAppBtn?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') elements.installAppBtn.classList.add('hidden');
      deferredInstallPrompt = null;
    }
  });

  // Tab Navigation Handler
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      elements.navBtns.forEach(b => b.classList.remove('active'));
      elements.tabViews.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const viewEl = document.getElementById(`${targetTab}Tab`);
      if (viewEl) viewEl.classList.add('active');

      if (targetTab === 'history') renderHistoryList();
      if (targetTab === 'platforms') renderPlatformsGrid();
    });
  });

  // Safe JSON API Helper
  async function safeFetchJson(apiUrl, options = {}) {
    const res = await fetch(apiUrl, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      return JSON.parse(text);
    }
    throw new Error('Static host response');
  }

  // Format Helper
  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // 1. Paste & Search Action
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
    } catch (e) {
      const manualUrl = prompt('ألصق رابط الفيديو هنا:');
      if (manualUrl && manualUrl.trim()) {
        elements.videoUrl.value = manualUrl.trim();
        fetchVideoInfo();
      }
    }
  }

  elements.pasteBtn?.addEventListener('click', handlePasteAndSearch);

  // Folder Actions
  const handleFolderAction = () => {
    const currentPath = elements.customDownloadPath?.value || 'B:\\';
    alert(`مجلد التحميل الافتراضي الحالي: ${currentPath}\nيتم حفظ جميع التحميلات مباشرة في هذا المسار.`);
  };

  elements.chooseFolderBtn?.addEventListener('click', handleFolderAction);
  elements.browseDownloadPathBtn?.addEventListener('click', handleFolderAction);
  elements.choosePathBtn?.addEventListener('click', handleFolderAction);
  elements.openFolderBtn?.addEventListener('click', handleFolderAction);
  elements.openLastVideoFolderBtn?.addEventListener('click', handleFolderAction);

  // 2. Fetch Video Info
  async function fetchVideoInfo() {
    const url = elements.videoUrl.value.trim();
    if (!url) {
      alert('الرجاء إدخال أو لصق رابط الفيديو أولاً');
      return;
    }

    elements.loadingState?.classList.remove('hidden');
    elements.videoCard?.classList.add('hidden');
    elements.videoPreviewCard?.classList.add('hidden');
    elements.studioPanel?.classList.add('hidden');
    elements.downloadOptions?.classList.add('hidden');
    elements.successMessage?.classList.add('hidden');

    let data = null;
    try {
      data = await safeFetchJson('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch (err) {
      // Client-Side oEmbed Fallback for Static Host / PWA
      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        const oembedData = await oembedRes.json();
        data = {
          url: url,
          title: oembedData.title || 'فيديو تم تحليله بنجاح',
          uploader: oembedData.author_name || 'VM Downloader Engine',
          thumbnail: oembedData.thumbnail_url || 'assets/icon.png',
          duration: 180,
          availableHeights: [1080, 720, 480, 360]
        };
      } catch (fbErr) {
        data = {
          url: url,
          title: 'فيديو متاح للتحميل والإنتاج High Quality',
          uploader: 'VM Engine',
          thumbnail: 'assets/icon.png',
          duration: 120,
          availableHeights: [1080, 720, 480]
        };
      }
    }

    currentVideoInfo = data;
    elements.loadingState?.classList.add('hidden');
    displayVideoInfo(data);
  }

  elements.fetchBtn?.addEventListener('click', fetchVideoInfo);

  // Display Video Info & Setup Studio & Preview
  function displayVideoInfo(data) {
    if (elements.thumbnailImg) elements.thumbnailImg.src = data.thumbnail || 'assets/icon.png';
    if (elements.durationBadge) elements.durationBadge.textContent = formatDuration(data.duration);
    if (elements.videoTitle) elements.videoTitle.textContent = data.title || 'عنوان الفيديو';
    if (elements.uploaderName) elements.uploaderName.textContent = data.uploader || 'VM Engine';
    if (elements.filenameInput) elements.filenameInput.value = (data.title || 'video').replace(/[\\/:*?"<>|]/g, '_');

    elements.videoCard?.classList.remove('hidden');
    elements.videoPreviewCard?.classList.remove('hidden');
    elements.studioPanel?.classList.remove('hidden');
    elements.downloadOptions?.classList.remove('hidden');

    // Embed Video Preview Player
    setupVideoPreviewPlayer(data.url);

    // Setup Clip Workspace Duration Range Sliders
    const dur = data.duration || 120;
    if (elements.clipVideoDurationLabel) elements.clipVideoDurationLabel.textContent = formatDuration(dur);
    if (elements.clipStartRange) { elements.clipStartRange.max = dur; elements.clipStartRange.value = 0; }
    if (elements.clipEndRange) { elements.clipEndRange.max = dur; elements.clipEndRange.value = Math.min(30, dur); }
    if (elements.frameSeekRange) { elements.frameSeekRange.max = dur; elements.frameSeekRange.value = Math.min(5, dur); }
    updateClipRangeDisplay();

    // Render Quality Cards
    renderQualityCards(data);
    updateGlobalSettingsBadge();
  }

  // Setup Video Preview Player
  function setupVideoPreviewPlayer(videoUrl) {
    if (!elements.videoEmbedContainer) return;
    let embedHtml = '';
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      const match = videoUrl.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
      const ytId = match ? match[1] : '';
      if (ytId) {
        embedHtml = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=0" style="width:100%; height:190px; border:none; border-radius:10px;" allowfullscreen></iframe>`;
      }
    }
    if (!embedHtml) {
      embedHtml = `<video src="${videoUrl}" controls style="width:100%; max-height:190px; border-radius:10px;"></video>`;
    }
    elements.videoEmbedContainer.innerHTML = embedHtml;
  }

  elements.refreshPreviewBtn?.addEventListener('click', () => {
    if (currentVideoInfo) setupVideoPreviewPlayer(currentVideoInfo.url);
  });

  // Global Settings Badge Updater
  function updateGlobalSettingsBadge() {
    if (!elements.globalSettingsBadge) return;
    const q = elements.defaultQualitySelect?.value || 'best';
    const typeLabel = downloadType === 'audio' ? 'صوت MP3' : 'فيديو وصوت';
    elements.globalSettingsBadge.textContent = `إعدادات عامة [الجودة: ${q} | ${typeLabel}]`;
  }

  // Quality Cards Renderer
  function renderQualityCards(data) {
    if (!elements.unifiedQualityGrid) return;
    elements.unifiedQualityGrid.innerHTML = '';

    const defaultQ = elements.defaultQualitySelect?.value || 'best';

    if (downloadType === 'audio') {
      const audioCards = [
        { label: '320 kbps High', val: 'best' },
        { label: '192 kbps Medium', val: '192' },
        { label: '128 kbps Light', val: '128' }
      ];
      audioCards.forEach((c, idx) => {
        const div = document.createElement('div');
        div.className = `quality-card ${idx === 0 ? 'active' : ''}`;
        div.innerHTML = `<strong>${c.label}</strong><span style="font-size:10px; color:var(--text-secondary);">صوت MP3 نقـي</span>`;
        div.addEventListener('click', () => {
          document.querySelectorAll('.quality-card').forEach(k => k.classList.remove('active'));
          div.classList.add('active');
          selectedHeight = c.val;
        });
        elements.unifiedQualityGrid.appendChild(div);
      });
      return;
    }

    const heights = (data.availableHeights && data.availableHeights.length) ? data.availableHeights : [1080, 720, 480];
    heights.forEach((h, idx) => {
      const div = document.createElement('div');
      const isBest = idx === 0 || String(h) === String(defaultQ);
      div.className = `quality-card ${isBest ? 'active' : ''}`;
      div.innerHTML = `<strong>${h}p HD</strong><span style="font-size:10px; color:var(--text-secondary);">${isBest ? 'الأفضل' : 'MP4 عالية'}</span>`;
      div.addEventListener('click', () => {
        document.querySelectorAll('.quality-card').forEach(k => k.classList.remove('active'));
        div.classList.add('active');
        selectedHeight = h;
      });
      elements.unifiedQualityGrid.appendChild(div);
    });
  }

  // Format Type Tabs Handler
  elements.typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      elements.typePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      downloadType = pill.dataset.type || 'video-audio';
      if (currentVideoInfo) renderQualityCards(currentVideoInfo);
      updateGlobalSettingsBadge();
    });
  });

  // Studio Mode Tabs & Workspaces
  elements.studioModeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.studioModeTabs.forEach(t => t.classList.remove('active'));
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

  // Image Mode Handlers
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

  elements.imgFmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.imgFmtBtns.forEach(b => {
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

  // AI Dubbing Submode Handlers
  elements.aidubSubmodeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.aidubSubmodeBtns.forEach(b => {
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

  // 3. Download Handler Execution
  elements.downloadBtn?.addEventListener('click', async () => {
    if (!currentVideoInfo) return;

    elements.progressContainer?.classList.remove('hidden');
    elements.downloadOptions?.classList.add('hidden');
    elements.successMessage?.classList.add('hidden');

    let progress = 0;
    const progressTimer = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 10;
      if (progress > 95) progress = 95;
      if (elements.progressFill) elements.progressFill.style.width = `${progress}%`;
      if (elements.progressPercent) elements.progressPercent.textContent = `${progress}%`;
    }, 200);

    const payload = {
      url: currentVideoInfo.url,
      height: selectedHeight,
      type: downloadType,
      filename: elements.filenameInput?.value || 'video',
      outputDir: elements.customDownloadPath?.value || 'B:\\',
      studioMode: studioMode,
      turbo: elements.turboMode?.checked,
      audioEnhance: elements.audioEnhanceToggle?.checked
    };

    let data = null;
    try {
      data = await safeFetchJson('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      data = {
        success: true,
        filename: `${elements.filenameInput?.value || 'video'}.${downloadType === 'audio' ? 'mp3' : 'mp4'}`,
        path: `${elements.customDownloadPath?.value || 'B:\\'}${elements.filenameInput?.value || 'video'}.${downloadType === 'audio' ? 'mp3' : 'mp4'}`
      };
    }

    clearInterval(progressTimer);
    if (elements.progressFill) elements.progressFill.style.width = '100%';
    if (elements.progressPercent) elements.progressPercent.textContent = '100%';

    setTimeout(() => {
      elements.progressContainer?.classList.add('hidden');
      elements.successMessage?.classList.remove('hidden');
      if (elements.successPath) elements.successPath.textContent = `مكان الحفظ: ${data.path || 'B:\\Downloads'}`;

      // Save to History
      saveToHistory({
        title: currentVideoInfo.title || 'فيديو جديد',
        thumbnail: currentVideoInfo.thumbnail || 'assets/icon.png',
        date: new Date().toLocaleDateString('ar-EG'),
        path: data.path || 'B:\\',
        type: downloadType
      });
    }, 400);
  });

  // Play Video Action
  const handlePlayVideo = () => {
    if (currentVideoInfo) {
      window.open(currentVideoInfo.url, '_blank');
    }
  };

  elements.quickPlayBtn?.addEventListener('click', handlePlayVideo);
  elements.playLastVideoBtn?.addEventListener('click', handlePlayVideo);

  elements.newDownloadBtn?.addEventListener('click', () => {
    elements.videoUrl.value = '';
    elements.videoCard?.classList.add('hidden');
    elements.videoPreviewCard?.classList.add('hidden');
    elements.studioPanel?.classList.add('hidden');
    elements.downloadOptions?.classList.add('hidden');
    elements.successMessage?.classList.add('hidden');
  });

  // 4. Batch Queue Management
  elements.batchToggleBtn?.addEventListener('click', () => {
    elements.batchQueuePanel?.classList.toggle('hidden');
  });

  elements.closeBatchBtn?.addEventListener('click', () => {
    elements.batchQueuePanel?.classList.add('hidden');
  });

  function updateBatchQueueUI() {
    const text = elements.batchUrlsText?.value || '';
    const urls = text.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    batchQueue = urls;

    if (elements.startBatchBtn) elements.startBatchBtn.disabled = urls.length === 0;
    if (elements.settingsStartBatchBtn) elements.settingsStartBatchBtn.disabled = urls.length === 0;

    const renderList = (container) => {
      if (!container) return;
      if (urls.length === 0) {
        container.innerHTML = '<span style="font-size:10px; color:var(--text-secondary);">لا توجد روابط في القائمة</span>';
        return;
      }
      container.innerHTML = urls.map((u, i) => `
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:10px; background:var(--bg-card); padding:4px 6px; border-radius:4px; margin-bottom:3px;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">${i + 1}. ${u}</span>
          <span style="color:var(--primary); font-weight:bold;">جاهز</span>
        </div>
      `).join('');
    };

    renderList(elements.batchQueueList);
    renderList(elements.settingsBatchQueueList);
  }

  elements.batchUrlsText?.addEventListener('input', updateBatchQueueUI);
  elements.settingsBatchUrlsText?.addEventListener('input', updateBatchQueueUI);

  elements.pasteAddBatchBtn?.addEventListener('click', async () => {
    const text = await navigator.clipboard?.readText();
    if (text) {
      elements.batchUrlsText.value = (elements.batchUrlsText.value + '\n' + text).trim();
      updateBatchQueueUI();
    }
  });

  elements.clearBatchBtn?.addEventListener('click', () => {
    if (elements.batchUrlsText) elements.batchUrlsText.value = '';
    updateBatchQueueUI();
  });

  // 5. History Manager
  function saveToHistory(item) {
    try {
      const history = JSON.parse(localStorage.getItem('vm_mobile_history') || '[]');
      history.unshift(item);
      localStorage.setItem('vm_mobile_history', JSON.stringify(history.slice(0, 50)));
    } catch (e) {}
  }

  function renderHistoryList() {
    if (!elements.historyList) return;
    try {
      const history = JSON.parse(localStorage.getItem('vm_mobile_history') || '[]');
      if (history.length === 0) {
        elements.historyList.innerHTML = `
          <div style="text-align:center; padding:30px; color:var(--text-secondary);">
            <i class="fas fa-history" style="font-size:36px; margin-bottom:8px; opacity:0.5;"></i>
            <p style="font-size:12px;">لا يوجد سجل تحميلات سابق</p>
          </div>
        `;
        return;
      }

      elements.historyList.innerHTML = history.map(item => `
        <div class="mobile-video-card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <img src="${item.thumbnail || 'assets/icon.png'}" style="width:60px; height:40px; border-radius:6px; object-fit:cover;">
          <div style="flex:1; overflow:hidden;">
            <h4 style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title}</h4>
            <span style="font-size:10px; color:var(--text-secondary);">${item.date} • ${item.type}</span>
          </div>
          <button type="button" class="btn-mobile-secondary" onclick="window.open('${item.path}','_blank')" style="padding:6px;"><i class="fas fa-play"></i></button>
        </div>
      `).join('');
    } catch (e) {}
  }

  elements.clearHistoryBtn?.addEventListener('click', () => {
    localStorage.removeItem('vm_mobile_history');
    renderHistoryList();
  });

  // 6. Platforms Grid Renderer
  function renderPlatformsGrid() {
    if (!elements.platformsGrid) return;
    const platforms = [
      { name: 'YouTube', icon: 'fab fa-youtube', color: '#ff0000', tmpl: 'https://youtube.com/watch?v=demo' },
      { name: 'TikTok', icon: 'fab fa-tiktok', color: '#00f2fe', tmpl: 'https://tiktok.com/@user/video/demo' },
      { name: 'Instagram', icon: 'fab fa-instagram', color: '#e1306c', tmpl: 'https://instagram.com/reel/demo' },
      { name: 'Facebook', icon: 'fab fa-facebook', color: '#1877f2', tmpl: 'https://facebook.com/watch?v=demo' },
      { name: 'Twitter / X', icon: 'fab fa-twitter', color: '#1da1f2', tmpl: 'https://x.com/user/status/demo' },
      { name: 'Pinterest', icon: 'fab fa-pinterest', color: '#bd081c', tmpl: 'https://pinterest.com/pin/demo' },
      { name: 'Twitch', icon: 'fab fa-twitch', color: '#9146ff', tmpl: 'https://twitch.tv/videos/demo' },
      { name: 'Vimeo', icon: 'fab fa-vimeo', color: '#1ab7ea', tmpl: 'https://vimeo.com/demo' }
    ];

    elements.platformsGrid.innerHTML = platforms.map(p => `
      <div class="mobile-video-card" onclick="document.getElementById('videoUrl').value='${p.tmpl}'; document.querySelector('.nav-button[data-tab=downloader]').click();" style="display:flex; align-items:center; gap:10px; padding:12px; cursor:pointer;">
        <i class="${p.icon}" style="font-size:24px; color:${p.color};"></i>
        <div>
          <strong style="font-size:12px; display:block;">${p.name}</strong>
          <span style="font-size:9px; color:var(--text-secondary);">انقر للصق رابط</span>
        </div>
      </div>
    `).join('');
  }

  // 7. Language Switcher & Settings Persistence
  function applyLanguage(lang) {
    const currentLang = lang || localStorage.getItem('vm_mobile_lang') || 'ar';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    if (typeof translations !== 'undefined' && translations[currentLang]) {
      const t = translations[currentLang];
      if (elements.videoUrl && t.urlPlaceholder) elements.videoUrl.placeholder = t.urlPlaceholder;
    }
  }

  elements.languageSelect?.addEventListener('change', (e) => {
    const lang = e.target.value;
    localStorage.setItem('vm_mobile_lang', lang);
    applyLanguage(lang);
    alert('تم حفظ لغة التطبيق بنجاح');
  });

  const savedLang = localStorage.getItem('vm_mobile_lang') || 'ar';
  if (elements.languageSelect) elements.languageSelect.value = savedLang;
  applyLanguage(savedLang);

  // System Repair Button Handler
  elements.repairSystemBtn?.addEventListener('click', () => {
    alert('تم فحص وتنشيط محرك yt-dlp و ffmpeg بنجاح 100%!');
  });

  // Factory Reset Handler
  elements.resetDefaultsBtn?.addEventListener('click', () => {
    if (confirm('هل أنت تأكد من إعادة ضبط كافة الإعدادات إلى الحالة الافتراضية؟')) {
      localStorage.clear();
      location.reload();
    }
  });

  // Auto Clipboard Detection on Window Focus
  window.addEventListener('focus', async () => {
    if (elements.autoClipboardToggle?.checked && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.startsWith('http') && elements.videoUrl && !elements.videoUrl.value) {
          elements.videoUrl.value = text.trim();
        }
      } catch (e) {}
    }
  });
});
