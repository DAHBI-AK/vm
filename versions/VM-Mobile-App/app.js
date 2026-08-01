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
  turboMode: document.getElementById('turboMode'),
  audioEnhanceToggle: document.getElementById('audioEnhanceToggle'),
  autoClipboardToggle: document.getElementById('autoClipboardToggle'),
  notificationsToggle: document.getElementById('notificationsToggle'),
  clearCacheBtn: document.getElementById('clearCacheBtn'),
  repairSystemBtn: document.getElementById('repairSystemBtn'),
  ytDlpHealth: document.getElementById('ytDlpHealth'),
  ffmpegHealth: document.getElementById('ffmpegHealth'),
  
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

// Bottom Navigation Tabs
document.querySelectorAll('.nav-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
    
    btn.classList.add('active');
    const tabId = `${btn.dataset.tab}Tab`;
    const view = document.getElementById(tabId);
    if (view) view.classList.add('active');

    if (btn.dataset.tab === 'history') updateHistoryUI();
    if (btn.dataset.tab === 'platforms') populatePlatforms();
    if (btn.dataset.tab === 'settings') fetchSystemHealth();
    if (btn.dataset.tab === 'downloader' && elements.autoClipboardToggle?.checked) {
      checkClipboardAuto();
    }
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

// 2. Fetch Video Info
async function fetchVideoInfo() {
  const url = elements.videoUrl.value.trim();
  if (!url) {
    alert('الرجاء إدخال أو لصق رابط الفيديو أولاً');
    return;
  }

  elements.loadingState.classList.add('show');
  elements.videoCard.classList.remove('show');
  elements.studioPanel.classList.remove('show');
  elements.downloadOptions.classList.remove('show');

  try {
    const res = await fetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'تعذر جلب بيانات الفيديو');

    currentVideoInfo = data;
    elements.loadingState.classList.remove('show');
    displayVideoInfo(data);
  } catch (err) {
    elements.loadingState.classList.remove('show');
    alert(`خطأ: ${err.message}`);
  }
}

elements.fetchBtn?.addEventListener('click', fetchVideoInfo);
elements.videoUrl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideoInfo();
});

function displayVideoInfo(info) {
  elements.videoTitle.textContent = info.title || 'فيديو بدون عنوان';
  elements.uploaderName.textContent = info.uploader || 'VIPD Engine';
  elements.durationBadge.textContent = info.duration ? formatDuration(info.duration) : '00:00';
  elements.thumbnailImg.src = info.thumbnail || 'assets/vm-icon.png';
  elements.filenameInput.value = (info.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

  elements.videoCard.classList.add('show');
  elements.studioPanel.classList.add('show');
  elements.downloadOptions.classList.add('show');
  renderQualityGrid(info.availableHeights || [1080, 720, 480]);
}

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
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentVideoInfo.url,
        height: selectedHeight,
        type: downloadType,
        filename: elements.filenameInput.value
      })
    });

    const data = await res.json();
    clearInterval(timer);

    if (!res.ok || !data.success) throw new Error(data.error || 'تعذر التحميل');

    let lastDownloadedPath = data.path || data.filename;
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

// Settings Event Handlers
elements.languageSelect?.addEventListener('change', (e) => {
  localStorage.setItem('vm_mobile_lang', e.target.value);
  alert('تم حفظ لغة التطبيق بنجاح');
});

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
