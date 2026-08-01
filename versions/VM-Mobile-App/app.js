// VM Mobile App Engine
let currentVideoInfo = null;
let selectedHeight = 'best';
let downloadType = 'video-audio';
let downloadHistory = JSON.parse(localStorage.getItem('vm_mobile_history') || '[]');
let studioMode = 'full';
let imageMode = 'thumbnail';

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

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
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),
  progressInfo: document.getElementById('progressInfo'),
  successPath: document.getElementById('successPath'),
  newDownloadBtn: document.getElementById('newDownloadBtn'),
  studioPanel: document.getElementById('studioPanel'),
  historyList: document.getElementById('historyList'),
  platformsGrid: document.getElementById('platformsGrid')
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
  });
});

// Clipboard Paste
elements.pasteBtn?.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      elements.videoUrl.value = text.trim();
      fetchVideoInfo();
    }
  } catch (err) {
    alert('ألصق الرابط يدوياً في الخانة');
  }
});

elements.clearBtn?.addEventListener('click', () => {
  elements.videoUrl.value = '';
});

// Fetch Video Info
async function fetchVideoInfo() {
  const url = elements.videoUrl.value.trim();
  if (!url) return;

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
    if (!res.ok || data.error) throw new Error(data.error || 'تعذر جلب البيانات');

    currentVideoInfo = data;
    elements.loadingState.classList.remove('show');
    displayVideoInfo(data);
  } catch (err) {
    elements.loadingState.classList.remove('show');
    alert(err.message);
  }
}

elements.fetchBtn?.addEventListener('click', fetchVideoInfo);

function displayVideoInfo(info) {
  elements.videoTitle.textContent = info.title;
  elements.uploaderName.textContent = info.uploader;
  elements.durationBadge.textContent = '03:15';
  elements.thumbnailImg.src = info.thumbnail || 'assets/vm-icon.png';
  elements.filenameInput.value = (info.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

  elements.videoCard.classList.add('show');
  elements.studioPanel.classList.add('show');
  elements.downloadOptions.classList.add('show');
  renderQualityGrid(info.availableHeights || [1080, 720, 480]);
}

function renderQualityGrid(heights) {
  selectedHeight = heights[0] || 'best';
  elements.unifiedQualityGrid.innerHTML = heights.map((h, i) => `
    <div class="quality-card ${i === 0 ? 'active' : ''}" data-height="${h}">
      <strong>${h}p HD</strong>
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

// Download
elements.downloadBtn?.addEventListener('click', async () => {
  if (!currentVideoInfo) return;

  elements.downloadOptions.classList.remove('show');
  elements.progressContainer.classList.add('show');

  let prog = 10;
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

    elements.progressPercent.textContent = '100%';
    elements.progressFill.style.width = '100%';
    elements.progressContainer.classList.remove('show');
    elements.successMessage.classList.add('show');
    elements.successPath.textContent = data.filename || 'تم حفظ الفيديو في تنزيلات الجوال';

    if (data.path) {
      const a = document.createElement('a');
      a.href = data.path;
      a.download = data.filename || 'video.mp4';
      a.click();
    }

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

function updateHistoryUI() {
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
  const platforms = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'Twitter / X', 'Pinterest', 'Twitch', 'Vimeo', 'SoundCloud', 'Reddit'];
  elements.platformsGrid.innerHTML = platforms.map(p => `
    <div style="padding:14px; background:var(--bg-card); border-radius:12px; text-align:center; margin-bottom:10px;">
      <i class="fas fa-check-circle" style="color:var(--primary); font-size:20px;"></i>
      <h4 style="margin-top:6px;">${p}</h4>
    </div>
  `).join('');
}
