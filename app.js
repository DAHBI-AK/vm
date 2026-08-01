// VIPD.SHOP — Universal Web App Engine (Electron + Browser Compatible)
const webApi = {
  getVideoInfo: async (url) => {
    const res = await fetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'تعذر جلب معلومات الفيديو');
    return data;
  },
  download: async (options) => {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'تعذر التحميل');
    return data;
  },
  getAppStatus: async () => {
    try {
      const res = await fetch('/api/status');
      return await res.json();
    } catch {
      return { ytDlp: true, ffmpeg: true, status: 'ready' };
    }
  },
  getSupportedPlatforms: async () => [
    'YouTube', 'TikTok', 'Instagram', 'Facebook', 'Twitter / X', 'Pinterest',
    'Twitch', 'LinkedIn', 'Threads', 'Rumble', 'VK', 'Telegram', 'Bilibili',
    'Vimeo', 'Dailymotion', 'Reddit', 'SoundCloud'
  ],
  selectDownloadFolder: async () => null,
  openDownloadsFolder: async () => ({ success: true }),
  showItemInFolder: async () => ({ success: true }),
  onClipboardUrlDetected: () => {},
  onDownloadProgress: () => {}
};

const api = window.electronAPI || webApi;

// Load App UI
let currentVideoInfo = null;
let selectedHeight = 'best';
let downloadType = 'video-audio';
let downloadHistory = JSON.parse(localStorage.getItem('vipd_history') || '[]');
let studioMode = 'full';
let imageMode = 'thumbnail';
let currentSection = 'downloader';

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
  thumbnailImg: document.getElementById('thumbnailImg'),
  durationBadge: document.getElementById('durationBadge'),
  videoTitle: document.getElementById('videoTitle'),
  videoUploader: document.getElementById('videoUploader'),
  videoDescription: document.getElementById('videoDescription'),
  unifiedQualityPanel: document.getElementById('unifiedQualityPanel'),
  unifiedQualityGrid: document.getElementById('unifiedQualityGrid'),
  downloadTypeTabs: document.getElementById('downloadTypeTabs'),
  qualityHint: document.getElementById('qualityHint'),
  filenameInput: document.getElementById('filenameInput'),
  downloadBtn: document.getElementById('downloadBtn'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  progressInfo: document.getElementById('progressInfo'),
  successPath: document.getElementById('successPath'),
  newDownloadBtn: document.getElementById('newDownloadBtn'),
  navItems: document.querySelectorAll('.nav-item'),
  sections: document.querySelectorAll('.section'),
  pageTitle: document.getElementById('pageTitle'),
  platformsGrid: document.getElementById('platformsGrid'),
  historyList: document.getElementById('historyList'),
  studioPanel: document.getElementById('studioPanel'),
  studioTabs: document.querySelectorAll('.studio-tab'),
  clipWorkspace: document.getElementById('clipWorkspace'),
  imageWorkspace: document.getElementById('imageWorkspace'),
  batchToggleBtn: document.getElementById('batchToggleBtn'),
  batchQueuePanel: document.getElementById('batchQueuePanel'),
  closeBatchBtn: document.getElementById('closeBatchBtn'),
  batchUrlsText: document.getElementById('batchUrlsText'),
  pasteAddBatchBtn: document.getElementById('pasteAddBatchBtn'),
  startBatchBtn: document.getElementById('startBatchBtn'),
  clearBatchBtn: document.getElementById('clearBatchBtn'),
  batchQueueList: document.getElementById('batchQueueList'),
  statusMessage: document.getElementById('statusMessage'),
  sidebarPasteBtn: document.getElementById('sidebarPasteBtn'),
  sidebarDownloadBtn: document.getElementById('sidebarDownloadBtn'),
  sidebarQuickPlayBtn: document.getElementById('sidebarQuickPlayBtn'),
  chooseDownloadFolderBtn: document.getElementById('chooseDownloadFolderBtn'),
  openLastDownloadSidebarBtn: document.getElementById('openLastDownloadSidebarBtn'),
  appSplash: document.getElementById('appSplash')
};

// Hide Splash
setTimeout(() => {
  if (elements.appSplash) {
    elements.appSplash.style.opacity = '0';
    setTimeout(() => elements.appSplash.style.display = 'none', 500);
  }
}, 800);

function showStatus(msg, type = 'info') {
  if (elements.statusMessage) {
    elements.statusMessage.textContent = msg;
    if (elements.statusBar) elements.statusBar.className = `status-bar ${type}`;
  }
}

function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Navigation
elements.navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    currentSection = section;
    elements.navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    elements.sections.forEach(sec => {
      sec.classList.toggle('active', sec.id === `${section}Section`);
    });
    if (section === 'history') updateHistoryUI();
    if (section === 'platforms') populatePlatforms();
  });
});

// Clipboard paste
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      elements.videoUrl.value = text.trim();
      fetchVideoInfo();
    } else {
      showStatus('الحافظة فارغة أو لا تحتوي على رابط', 'error');
    }
  } catch (err) {
    showStatus('الرجاء الإلصاق يدوياً في خانة الرابط', 'info');
  }
}

elements.pasteBtn?.addEventListener('click', pasteFromClipboard);
elements.sidebarPasteBtn?.addEventListener('click', pasteFromClipboard);
elements.clearBtn?.addEventListener('click', () => {
  elements.videoUrl.value = '';
  elements.videoCard.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.downloadOptions.classList.remove('show');
});

// REAL Fetch video info
async function fetchVideoInfo() {
  const url = elements.videoUrl.value.trim();
  if (!url) return;

  elements.loadingState.classList.add('show');
  elements.videoCard.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.downloadOptions.classList.remove('show');
  showStatus('جاري تحليل رابط الفيديو...', 'info');

  try {
    const data = await api.getVideoInfo(url);
    currentVideoInfo = data;
    elements.loadingState.classList.remove('show');
    displayVideoInfo(data);
  } catch (err) {
    elements.loadingState.classList.remove('show');
    showStatus(err.message, 'error');
  }
}

elements.fetchBtn?.addEventListener('click', fetchVideoInfo);
elements.videoUrl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

function displayVideoInfo(info) {
  elements.videoTitle.textContent = info.title;
  elements.uploaderName.textContent = info.uploader;
  elements.durationBadge.textContent = formatDuration(info.duration);
  elements.thumbnailImg.src = info.thumbnail || 'assets/vm-icon.png';
  elements.filenameInput.value = (info.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

  elements.videoCard.classList.add('show');
  elements.studioPanel.classList.add('show');
  elements.downloadOptions.classList.add('show');
  renderQualityGrid(info.availableHeights || [1080, 720, 480]);
  showStatus('تم جلب معلومات الفيديو بنجاح', 'success');
}

function renderQualityGrid(heights) {
  selectedHeight = heights[0] || 'best';
  elements.unifiedQualityGrid.innerHTML = heights.map((h, i) => `
    <button type="button" class="quality-card ${i === 0 ? 'active' : ''}" data-height="${h}">
      <div class="quality-title">${h}p HD</div>
      <div class="quality-size">جودة ممتازة</div>
      ${i === 0 ? '<span class="quality-badge">أعلى جودة</span>' : ''}
    </button>
  `).join('');

  elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.unifiedQualityGrid.querySelectorAll('.quality-card').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      selectedHeight = btn.dataset.height;
    });
  });
}

// Download action
async function startDownload() {
  if (!currentVideoInfo) return;

  elements.downloadOptions.classList.remove('show');
  elements.progressContainer.classList.add('show');
  elements.downloadBtn.disabled = true;

  let prog = 10;
  elements.progressPercent.textContent = '10%';
  elements.progressFill.style.width = '10%';
  elements.progressInfo.textContent = 'جاري التنزيل والمعالجة...';

  const progressTimer = setInterval(() => {
    if (prog < 90) {
      prog += 5;
      elements.progressPercent.textContent = `${prog}%`;
      elements.progressFill.style.width = `${prog}%`;
    }
  }, 400);

  try {
    const data = await api.download({
      url: currentVideoInfo.url,
      height: selectedHeight,
      type: downloadType,
      filename: elements.filenameInput.value,
      studioMode,
      imageMode
    });

    clearInterval(progressTimer);
    elements.progressPercent.textContent = '100%';
    elements.progressFill.style.width = '100%';
    elements.progressContainer.classList.remove('show');
    elements.successMessage.classList.add('show');
    elements.successPath.textContent = data.filename || data.path;
    elements.downloadBtn.disabled = false;
    showStatus('تم التحميل بنجاح في VIPD.SHOP', 'success');

    if (data.path) {
      const a = document.createElement('a');
      a.href = data.path;
      a.download = data.filename || 'video.mp4';
      a.click();
    }

    addToHistory({
      title: currentVideoInfo.title,
      uploader: currentVideoInfo.uploader,
      date: new Date().toLocaleDateString('ar-SA')
    });
  } catch (err) {
    clearInterval(progressTimer);
    elements.progressContainer.classList.remove('show');
    elements.downloadBtn.disabled = false;
    showStatus(err.message, 'error');
  }
}

elements.downloadBtn?.addEventListener('click', startDownload);
elements.sidebarDownloadBtn?.addEventListener('click', startDownload);
elements.newDownloadBtn?.addEventListener('click', () => {
  elements.successMessage.classList.remove('show');
  elements.videoUrl.value = '';
});

function addToHistory(item) {
  downloadHistory.unshift(item);
  localStorage.setItem('vipd_history', JSON.stringify(downloadHistory));
}

function updateHistoryUI() {
  if (downloadHistory.length === 0) {
    elements.historyList.innerHTML = `<div class="empty-state"><h3>لا يوجد سجل تحميلات</h3></div>`;
    return;
  }
  elements.historyList.innerHTML = downloadHistory.map(item => `
    <div class="history-item" style="padding:14px; background:var(--bg-card); margin-bottom:10px; border-radius:8px;">
      <h4>${item.title}</h4>
      <p style="color:var(--text-secondary); font-size:12px;">${item.uploader} • ${item.date}</p>
    </div>
  `).join('');
}

async function populatePlatforms() {
  const platforms = await api.getSupportedPlatforms();
  elements.platformsGrid.innerHTML = platforms.map(p => `
    <div class="platform-card" style="padding:16px; background:var(--bg-card); border-radius:8px; text-align:center;">
      <i class="fas fa-check-circle" style="color:var(--primary); font-size:24px;"></i>
      <h4 style="margin-top:8px;">${p}</h4>
    </div>
  `).join('');
}
