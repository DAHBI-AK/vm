// State
let currentVideoInfo = null;
let selectedFormat = null;
let selectedType = null;
let selectedHeight = 'best';
let selectedAbr = 'best';
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
let fsZoomScale = 1;
let fsPan = { x: 0, y: 0 };
let cropPositionPercent = { x: 50, y: 50 };
let maskShape = 'rect';
let imageAspect = 'default';
let imageOutputSize = 'original';
let cropToolEnabled = false;
/** منطقة القص كنِسب مئوية من الحاوية: x,y,w,h */
let cropRect = { x: 20, y: 20, w: 60, h: 60 };

function getAspectRatioNumber() {
  if (imageAspect === '1:1') return 1;
  if (imageAspect === '16:9') return 16 / 9;
  if (imageAspect === '9:16') return 9 / 16;
  if (imageAspect === '4:5') return 4 / 5;
  if (imageAspect === '21:9') return 21 / 9;
  return null;
}

function updateMaskShapeUI() {
  const thumbCrop = document.getElementById('thumbCropFrame');
  const frameCrop = document.getElementById('frameCropFrame');
  const fsCrop = document.getElementById('fsCropFrame');
  let radius = '4px';
  if (maskShape === 'circle') radius = '50%';
  else if (maskShape === 'rounded') radius = '18px';

  [thumbCrop, frameCrop, fsCrop].forEach((el) => {
    if (el) el.style.borderRadius = radius;
  });
}

function getAspectCssValue() {
  if (imageAspect === '1:1') return '1 / 1';
  if (imageAspect === '9:16') return '9 / 16';
  if (imageAspect === '4:5') return '4 / 5';
  if (imageAspect === '16:9') return '16 / 9';
  if (imageAspect === '21:9') return '21 / 9';
  if (imageAspect === 'custom') {
    const w = parseInt(document.getElementById('customAspectWidth')?.value, 10) || 1080;
    const h = parseInt(document.getElementById('customAspectHeight')?.value, 10) || 1080;
    return `${w} / ${h}`;
  }
  return '';
}

function updateAspectBadge() {
  const aspectBadge = document.getElementById('aspectBadge');
  if (!aspectBadge) return;
  const aspectLabels = {
    default: 'حر',
    '16:9': '16:9',
    '1:1': '1:1',
    '9:16': '9:16',
    '4:5': '4:5',
    '21:9': '21:9',
    custom: 'مخصص'
  };
  const sizeLabels = {
    original: 'حجم أصلي',
    '480': '480px',
    '720': '720px',
    '1080': '1080px',
    custom: 'مخصص'
  };
  const a = aspectLabels[imageAspect] || imageAspect;
  const s = sizeLabels[imageOutputSize] || imageOutputSize;
  const cropTxt = cropToolEnabled
    ? ` · قص ${Math.round(cropRect.w)}×${Math.round(cropRect.h)}%`
    : '';
  if (imageOutputSize === 'custom') {
    const w = document.getElementById('customAspectWidth')?.value || 1080;
    const h = document.getElementById('customAspectHeight')?.value || 1080;
    aspectBadge.textContent = `📐 ${a} · ${w}×${h}${cropTxt}`;
  } else {
    aspectBadge.textContent = `📐 ${a} · ${s}${cropTxt}`;
  }
}

function applyCropOverlayGeometry(cropEl, sizeReadoutId) {
  if (!cropEl) return;
  cropEl.style.left = `${cropRect.x}%`;
  cropEl.style.top = `${cropRect.y}%`;
  cropEl.style.width = `${cropRect.w}%`;
  cropEl.style.height = `${cropRect.h}%`;
  const readout = document.getElementById(sizeReadoutId);
  if (readout) {
    readout.textContent = `${Math.round(cropRect.w)}×${Math.round(cropRect.h)}%`;
  }
}

function syncCropOverlays() {
  applyCropOverlayGeometry(document.getElementById('thumbCropFrame'), 'thumbCropSize');
  applyCropOverlayGeometry(document.getElementById('frameCropFrame'), 'frameCropSize');
  applyCropOverlayGeometry(document.getElementById('fsCropFrame'), 'fsCropSize');
  updateAspectBadge();
  updateFsEditorControlsUI();
}

function setCropToolEnabled(enabled) {
  cropToolEnabled = !!enabled;
  const thumbCrop = document.getElementById('thumbCropFrame');
  const frameCrop = document.getElementById('frameCropFrame');
  const fsCrop = document.getElementById('fsCropFrame');
  const thumbBtn = document.getElementById('thumbCropToggleBtn');
  const frameBtn = document.getElementById('frameCropToggleBtn');
  const fsBtn = document.getElementById('fsCropToggleBtn');

  if (thumbCrop) thumbCrop.hidden = !cropToolEnabled;
  if (frameCrop) frameCrop.hidden = !cropToolEnabled;
  if (fsCrop) fsCrop.hidden = !cropToolEnabled;
  thumbBtn?.classList.toggle('active', cropToolEnabled);
  frameBtn?.classList.toggle('active', cropToolEnabled);
  fsBtn?.classList.toggle('active', cropToolEnabled);

  if (cropToolEnabled) {
    fitCropRectToAspect();
    syncCropOverlays();
    bindInteractiveCrop('thumbCropFrame', 'thumbImgContainer', 'thumbCropSize');
    bindInteractiveCrop('frameCropFrame', 'frameImgContainer', 'frameCropSize');
    bindInteractiveCrop('fsCropFrame', 'fullscreenStage', 'fsCropSize');
  }
  updateMaskShapeUI();
  updateAspectBadge();
}

function syncMainAspectSizePills() {
  document.querySelectorAll('#aspectPills .aspect-pill, #fsAspectPills .aspect-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.aspect === imageAspect);
  });
  document.querySelectorAll('#outputSizePills .size-pill, #fsSizePills .size-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.size === imageOutputSize);
  });
  document.querySelectorAll('#maskShapePills .mask-shape-pill, #fsMaskPills .mask-shape-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.shape === maskShape);
  });

  const mainCustom = document.getElementById('customAspectInputs');
  const fsCustom = document.getElementById('fsCustomInputs');
  if (mainCustom) mainCustom.style.display = imageOutputSize === 'custom' ? 'flex' : 'none';
  if (fsCustom) fsCustom.style.display = imageOutputSize === 'custom' ? 'flex' : 'none';

  const wMain = document.getElementById('customAspectWidth');
  const hMain = document.getElementById('customAspectHeight');
  const wFs = document.getElementById('fsCustomWidth');
  const hFs = document.getElementById('fsCustomHeight');
  if (wFs && wMain) wFs.value = wMain.value;
  if (hFs && hMain) hFs.value = hMain.value;
}

function updateFsEditorControlsUI() {
  syncMainAspectSizePills();
  const fsTimeSection = document.getElementById('fsFrameTimeSection');
  if (fsTimeSection) {
    fsTimeSection.hidden = imageMode !== 'frame';
  }
  const fsRange = document.getElementById('fsFrameTimeRange');
  const fsInput = document.getElementById('fsFrameTimeInput');
  const fsBadge = document.getElementById('fsFrameTimeBadge');
  if (fsRange) {
    fsRange.max = videoDuration || 100;
    fsRange.value = frameTime;
  }
  const tc = formatTimecode(frameTime);
  if (fsInput) fsInput.value = tc;
  if (fsBadge) fsBadge.textContent = tc;
}

function toggleFsPopover(popId, btnId, force) {
  const pop = document.getElementById(popId);
  const btn = document.getElementById(btnId);
  if (!pop) return;
  const open = typeof force === 'boolean' ? force : pop.classList.contains('hidden');
  // أغلق النوافذ الأخرى
  if (open) {
    document.getElementById('fsDimPopover')?.classList.add('hidden');
    document.getElementById('fsTimePopover')?.classList.add('hidden');
    document.getElementById('fsDimToggleBtn')?.classList.remove('active');
    document.getElementById('fsTimeToggleBtn')?.classList.remove('active');
  }
  pop.classList.toggle('hidden', !open);
  btn?.classList.toggle('active', open);
  if (open) updateFsEditorControlsUI();
}

function closeAllFsPopovers() {
  document.getElementById('fsDimPopover')?.classList.add('hidden');
  document.getElementById('fsTimePopover')?.classList.add('hidden');
  document.getElementById('fsDimToggleBtn')?.classList.remove('active');
  document.getElementById('fsTimeToggleBtn')?.classList.remove('active');
}

function updateFsMediaTransform() {
  const modalImg = document.getElementById('fullscreenModalImg');
  const modalVideo = document.getElementById('fullscreenModalVideo');
  const fsZoomLabel = document.getElementById('fsZoomLabel');
  const transform = `translate(${fsPan.x}px, ${fsPan.y}px) scale(${fsZoomScale})`;
  if (modalImg) modalImg.style.transform = transform;
  if (modalVideo) modalVideo.style.transform = transform;
  if (fsZoomLabel) fsZoomLabel.textContent = `${Math.round(fsZoomScale * 100)}%`;
}

function updateFsTransform() {
  updateFsMediaTransform();
}

async function refreshFullscreenFrameAt(timeSec) {
  frameTime = Math.max(0, Math.min(Number(timeSec) || 0, videoDuration || Number(timeSec) || 0));
  if (elements.frameTimeRange) elements.frameTimeRange.value = frameTime;
  if (elements.frameTimeInput) elements.frameTimeInput.value = formatTimecode(frameTime);
  if (elements.frameTimeBadge) elements.frameTimeBadge.textContent = formatTimecode(frameTime);
  updateFsEditorControlsUI();

  const modalVideo = document.getElementById('fullscreenModalVideo');
  const modalImg = document.getElementById('fullscreenModalImg');
  const framePlayer = document.getElementById('frameVideoPlayer');

  // حدّث معاينة الاستوديو أيضاً
  syncFrameCapturePreview(frameTime);

  if (modalVideo && modalVideo.src) {
    try {
      modalVideo.pause();
      modalVideo.currentTime = frameTime;
      modalVideo.style.display = 'block';
      if (modalImg) modalImg.style.display = 'none';
      const modalTitle = document.getElementById('modalImageTitle');
      if (modalTitle) modalTitle.textContent = `شاشة كاملة — لقطة الفيديو ${formatTimecode(frameTime)}`;
      return;
    } catch { /* fallthrough */ }
  }

  if (framePlayer?.src && framePlayer.videoWidth) {
    try {
      framePlayer.currentTime = frameTime;
      const src = captureVideoFrameDataUrl(framePlayer);
      if (src && modalImg) {
        modalImg.src = src;
        modalImg.style.display = 'block';
      }
      if (modalVideo) modalVideo.style.display = 'none';
    } catch { /* ignore */ }
  }
}

function openImageFullscreenEditor() {
  const modal = document.getElementById('imageFullscreenModal');
  const modalImg = document.getElementById('fullscreenModalImg');
  const modalVideo = document.getElementById('fullscreenModalVideo');
  const modalTitle = document.getElementById('modalImageTitle');
  if (!modal || !modalImg) return;

  fsZoomScale = 1;
  fsPan = { x: 0, y: 0 };
  updateFsEditorControlsUI();

  if (imageMode === 'frame') {
    if (modalTitle) modalTitle.textContent = `شاشة كاملة — لقطة الفيديو ${formatTimecode(frameTime)}`;
    const framePlayer = document.getElementById('frameVideoPlayer');
    const clipPlayer = document.getElementById('clipVideoPlayer');
    const streamSrc = framePlayer?.src || clipPlayer?.src || '';

    if (streamSrc && modalVideo) {
      if (modalVideo.src !== streamSrc) modalVideo.src = streamSrc;
      modalVideo.style.display = 'block';
      modalImg.style.display = 'none';
      const seek = () => {
        try {
          modalVideo.currentTime = frameTime;
          modalVideo.pause();
        } catch { /* ignore */ }
      };
      if (modalVideo.readyState >= 1) seek();
      else modalVideo.addEventListener('loadedmetadata', seek, { once: true });
    } else {
      const frameImg = document.getElementById('framePreviewImg');
      let src = '';
      if (framePlayer?.src && framePlayer.videoWidth) src = captureVideoFrameDataUrl(framePlayer);
      if (!src) src = frameImg?.currentSrc || frameImg?.src || currentVideoInfo?.thumbnail || '';
      if (!src) {
        showStatus('لا يمكن عرض اللقطة حالياً', 'info');
        return;
      }
      modalImg.src = src;
      modalImg.style.display = 'block';
      if (modalVideo) {
        modalVideo.removeAttribute('src');
        modalVideo.style.display = 'none';
      }
    }
  } else {
    if (modalTitle) modalTitle.textContent = 'شاشة كاملة — الصورة المصغرة';
    const thumbImg = document.getElementById('thumbnailPreviewImg');
    const src = thumbImg?.currentSrc || thumbImg?.src || currentVideoInfo?.thumbnail;
    if (!src) {
      showStatus('لا توجد صورة مصغرة بعد', 'info');
      return;
    }
    modalImg.src = src;
    modalImg.style.display = 'block';
    if (modalVideo) {
      modalVideo.removeAttribute('src');
      modalVideo.style.display = 'none';
    }
  }

  modal.hidden = false;
  modal.classList.add('show');
  updateFsTransform();

  // فعّل القص تلقائياً في الشاشة الكاملة ليسهل التعديل
  if (!cropToolEnabled) setCropToolEnabled(true);
  else {
    bindInteractiveCrop('fsCropFrame', 'fullscreenStage', 'fsCropSize');
    syncCropOverlays();
  }
  updateMaskShapeUI();
}

function openImageFullscreenModal(imgSrc, title = 'معاينة بحجم الشاشة الكاملة') {
  // توافق خلفي — يفتح المحرر الكامل
  openImageFullscreenEditor();
  const modalTitle = document.getElementById('modalImageTitle');
  const modalImg = document.getElementById('fullscreenModalImg');
  if (modalTitle && title) modalTitle.textContent = title;
  if (modalImg && imgSrc && imageMode === 'thumbnail') modalImg.src = imgSrc;
}

function closeImageFullscreenModal() {
  const modal = document.getElementById('imageFullscreenModal');
  const modalVideo = document.getElementById('fullscreenModalVideo');
  closeAllFsPopovers();
  if (modal) {
    modal.hidden = true;
    modal.classList.remove('show');
  }
  if (modalVideo) {
    try { modalVideo.pause(); } catch { /* ignore */ }
  }
  fsZoomScale = 1;
  fsPan = { x: 0, y: 0 };
  applyAspectToPreviewScreens();
  syncCropOverlays();
  if (imageMode === 'frame') syncFrameCapturePreview(frameTime);
}

function openCurrentImageFullscreen() {
  openImageFullscreenEditor();
}

function fitCropRectToAspect() {
  const ratio = getAspectRatioNumber();
  const container = document.getElementById(
    imageMode === 'frame' ? 'frameImgContainer' : 'thumbImgContainer'
  );
  const cw = container?.clientWidth || 640;
  const ch = container?.clientHeight || 360;

  if (!ratio) {
    if (cropRect.w < 10 || cropRect.h < 10) {
      cropRect = { x: 20, y: 20, w: 60, h: 60 };
    }
    return;
  }

  // نريد (w%*cw)/(h%*ch) = ratio ⇒ w/h = ratio * ch/cw
  const boxRatio = ratio * (ch / cw);
  let w = 70;
  let h = w / boxRatio;
  if (h > 80) {
    h = 80;
    w = h * boxRatio;
  }
  if (w > 90) {
    w = 90;
    h = w / boxRatio;
  }
  cropRect.w = Math.max(12, Math.min(95, w));
  cropRect.h = Math.max(12, Math.min(95, h));
  cropRect.x = Math.max(0, Math.min(100 - cropRect.w, (100 - cropRect.w) / 2));
  cropRect.y = Math.max(0, Math.min(100 - cropRect.h, (100 - cropRect.h) / 2));
}

function applyAspectToPreviewScreens() {
  const thumbnailImg = document.getElementById('thumbnailPreviewImg');
  const frameImg = document.getElementById('framePreviewImg');
  const framePlayer = document.getElementById('frameVideoPlayer');
  const thumbContainer = document.getElementById('thumbImgContainer');
  const frameContainer = document.getElementById('frameImgContainer');
  const customInputs = document.getElementById('customAspectInputs');

  if (customInputs) {
    customInputs.style.display = imageOutputSize === 'custom' ? 'flex' : 'none';
  }

  const aspectStyle = getAspectCssValue();
  const isPortrait = imageAspect === '9:16' || imageAspect === '4:5' || imageAspect === '1:1';

  [thumbContainer, frameContainer].forEach((cont) => {
    if (!cont) return;
    cont.style.maxWidth = isPortrait ? '280px' : '100%';
    cont.style.maxHeight = isPortrait ? '380px' : '320px';
    cont.style.margin = '0 auto';
    // لا نفرض object-cover على الصورة أثناء القص الحر — نترك contain ونقص فوقها
    cont.style.aspectRatio = '';
  });

  [thumbnailImg, frameImg, framePlayer].forEach((el) => {
    if (!el) return;
    el.style.aspectRatio = '';
    el.style.objectFit = 'contain';
    el.style.width = '100%';
    el.style.height = 'auto';
    el.style.maxHeight = '100%';
  });

  if (cropToolEnabled && getAspectRatioNumber()) {
    fitCropRectToAspect();
    syncCropOverlays();
  }

  updateMaskShapeUI();
  applyPreviewZoomTransforms();
  updateAspectBadge();
}

function applyPreviewZoomTransforms() {
  const thumbImg = document.getElementById('thumbnailPreviewImg');
  const frameImg = document.getElementById('framePreviewImg');
  const framePlayer = document.getElementById('frameVideoPlayer');
  const thumbZoomLabel = document.getElementById('thumbZoomLabel');
  const frameZoomLabel = document.getElementById('frameZoomLabel');

  if (thumbImg) {
    thumbImg.style.transformOrigin = 'center center';
    thumbImg.style.transform = `scale(${thumbZoomScale})`;
  }
  if (frameImg) {
    frameImg.style.transformOrigin = 'center center';
    frameImg.style.transform = `scale(${frameZoomScale})`;
  }
  if (framePlayer) {
    framePlayer.style.transformOrigin = 'center center';
    framePlayer.style.transform = `scale(${frameZoomScale})`;
  }
  if (thumbZoomLabel) thumbZoomLabel.textContent = `${Math.round(thumbZoomScale * 100)}%`;
  if (frameZoomLabel) frameZoomLabel.textContent = `${Math.round(frameZoomScale * 100)}%`;
}

function bindInteractiveCrop(cropId, containerId, sizeReadoutId) {
  const cropEl = document.getElementById(cropId);
  const containerEl = document.getElementById(containerId);
  if (!cropEl || !containerEl || cropEl.dataset.interactiveBound) return;
  cropEl.dataset.interactiveBound = 'true';

  let mode = null; // 'move' | handle name
  let startX = 0;
  let startY = 0;
  let startRect = null;

  const minPct = 8;

  function clampRect(r) {
    r.w = Math.max(minPct, Math.min(100, r.w));
    r.h = Math.max(minPct, Math.min(100, r.h));
    r.x = Math.max(0, Math.min(100 - r.w, r.x));
    r.y = Math.max(0, Math.min(100 - r.h, r.y));
    return r;
  }

  function applyAspectLock(r, anchor) {
    const ratio = getAspectRatioNumber();
    if (!ratio || !containerEl.clientWidth || !containerEl.clientHeight) return r;
    // نسبة العرض/الارتفاع بالبكسل = (w%/h%) * (cw/ch) = ratio
    // ⇒ w/h = ratio * ch/cw
    const boxRatio = ratio * (containerEl.clientHeight / containerEl.clientWidth);
    if (anchor === 'w' || anchor === 'e' || anchor === 'nw' || anchor === 'ne' || anchor === 'sw' || anchor === 'se') {
      r.h = r.w / boxRatio;
    } else {
      r.w = r.h * boxRatio;
    }
    return clampRect(r);
  }

  cropEl.addEventListener('mousedown', (e) => {
    if (!cropToolEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.target?.dataset?.handle;
    mode = handle || 'move';
    startX = e.clientX;
    startY = e.clientY;
    startRect = { ...cropRect };
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!mode || !startRect || !containerEl.clientWidth) return;
    const dxPct = ((e.clientX - startX) / containerEl.clientWidth) * 100;
    const dyPct = ((e.clientY - startY) / containerEl.clientHeight) * 100;
    let next = { ...startRect };

    if (mode === 'move') {
      next.x = startRect.x + dxPct;
      next.y = startRect.y + dyPct;
      next = clampRect(next);
    } else {
      if (mode.includes('e')) {
        next.w = startRect.w + dxPct;
      }
      if (mode.includes('s')) {
        next.h = startRect.h + dyPct;
      }
      if (mode.includes('w')) {
        next.x = startRect.x + dxPct;
        next.w = startRect.w - dxPct;
      }
      if (mode.includes('n')) {
        next.y = startRect.y + dyPct;
        next.h = startRect.h - dyPct;
      }
      next = applyAspectLock(clampRect(next), mode);
      // بعد قفل النسبة أعد ضبط الموضع للمقابض الغربية/الشمالية
      if (mode.includes('w')) {
        next.x = startRect.x + startRect.w - next.w;
      }
      if (mode.includes('n')) {
        next.y = startRect.y + startRect.h - next.h;
      }
      next = clampRect(next);
    }

    cropRect = next;
    cropPositionPercent.x = cropRect.w > 0 ? (cropRect.x / Math.max(1, 100 - cropRect.w)) * 100 : 50;
    cropPositionPercent.y = cropRect.h > 0 ? (cropRect.y / Math.max(1, 100 - cropRect.h)) * 100 : 50;
    syncCropOverlays();
  });

  window.addEventListener('mouseup', () => {
    if (mode) {
      mode = null;
      startRect = null;
      document.body.style.userSelect = '';
    }
  });
}

function captureVideoFrameDataUrl(videoEl) {
  if (!videoEl || !videoEl.videoWidth) return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function bindPreviewPanZoom(containerId, getScale, setScale) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.panBound) return;
  container.dataset.panBound = 'true';

  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const next = e.deltaY < 0
      ? Math.min(5, getScale() + 0.15)
      : Math.max(0.4, getScale() - 0.15);
    setScale(next);
    applyPreviewZoomTransforms();
  }, { passive: false });
}
let timelineRaf = null;
const clientInfoCache = new Map();
let storedFormats = null;
let downloadType = 'video-audio';
let currentSection = 'downloader';

let downloadQueue = [];
let downloadQueueUrlSet = new Set();
let isQueueProcessing = false;
let batchStopRequested = false;
let batchUiPage = 0;
let queueUiTimer = null;
const BATCH_UI_PAGE_SIZE = 60;
const BATCH_KEEP_COMPLETED = 40;
const BATCH_ITEM_DELAY_MS = 800;
let batchSessionStats = { done: 0, error: 0, processed: 0 };

const DEFAULT_DOWNLOAD_PATH_KEY = 'defaultDownloadPath';
const DEFAULT_VIDEO_QUALITY_KEY = 'defaultVideoQuality';
const CLIPBOARD_WATCH_KEY = 'clipboardAutoDetect';
const NOTIFICATIONS_KEY = 'notificationsEnabled';
let pendingClipboardUrl = '';

function getPreferredDefaultQuality() {
  const value = localStorage.getItem(DEFAULT_VIDEO_QUALITY_KEY) || 'best';
  return value || 'best';
}

function getBatchQualityChoices() {
  // من الأقل للأعلى + أقصى جودة بدون سقف كافتراضي
  return [
    { value: 'best', label: 'أقصى جودة متاحة (بدون سقف — حتى 8K)' },
    { value: '144', label: '144p — منخفضة جداً' },
    { value: '240', label: '240p — منخفضة' },
    { value: '360', label: '360p' },
    { value: '480', label: '480p' },
    { value: '720', label: '720p HD' },
    { value: '1080', label: '1080p Full HD' },
    { value: '1440', label: '1440p · 2K QHD' },
    { value: '2160', label: '2160p · 4K UHD' },
    { value: '4320', label: '4320p · 8K' }
  ];
}

function getBatchAudioQualityChoices() {
  // من أقل معدل بت إلى أقصى جودة صوت بدون سقف
  return [
    { value: 'best', label: 'أقصى جودة صوت متاحة (بدون سقف)' },
    { value: '64', label: '64 kbps — منخفضة جداً' },
    { value: '96', label: '96 kbps — منخفضة' },
    { value: '128', label: '128 kbps — متوسطة' },
    { value: '160', label: '160 kbps' },
    { value: '192', label: '192 kbps — عالية' },
    { value: '256', label: '256 kbps — فائقة' },
    { value: '320', label: '320 kbps — أقصى MP3' }
  ];
}

function renderBatchQualityOptions(selected = 'best', type = 'video-audio') {
  const current = String(selected || 'best');
  if (type === 'audio') {
    return getBatchAudioQualityChoices().map((opt) => (
      `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`
    )).join('');
  }
  if (type === 'bulk') {
    const videoOpts = getBatchQualityChoices().map((opt) => (
      `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`
    )).join('');
    const audioOpts = getBatchAudioQualityChoices().map((opt) => (
      `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`
    )).join('');
    return `<optgroup label="فيديو">${videoOpts}</optgroup><optgroup label="صوت MP3">${audioOpts}</optgroup>`;
  }
  return getBatchQualityChoices().map((opt) => (
    `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`
  )).join('');
}

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
  imageModeCards: document.querySelectorAll('.image-source-pill, .image-mode-card'),
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
  stopBatchBtn: document.getElementById('stopBatchBtn'),
  clearCompletedBatchBtn: document.getElementById('clearCompletedBatchBtn'),
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
    { key: 'high', label: t('tierHigh'), min: 721, max: 1080 },
    { key: 'uhd', label: t('tierUhd'), min: 1081, max: 2160 },
    { key: 'eightk', label: t('tier8k'), min: 2161, max: Infinity }
  ];
}

function getAudioQualityTiers() {
  return [
    { key: 'low', label: t('tierAudioLow'), min: 0, max: 96 },
    { key: 'medium', label: t('tierAudioMedium'), min: 97, max: 160 },
    { key: 'high', label: t('tierAudioHigh'), min: 161, max: 256 },
    { key: 'uhd', label: t('tierAudioUltra'), min: 257, max: Infinity }
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

  document.querySelectorAll('.image-source-pill, .image-mode-card').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.imageMode === imageMode);
  });

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
  updateDownloadButtonText();
  updateFsEditorControlsUI();
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
  updatePreviewActiveBadge();
  maybeRefreshOpenPreview();
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
  updatePreviewActiveBadge();
  maybeRefreshOpenPreview();
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
      imageMode = card.dataset.imageMode || 'thumbnail';
      updateImageWorkspaceUI();
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
  document.getElementById('thumbCropToggleBtn')?.addEventListener('click', () => {
    setCropToolEnabled(!cropToolEnabled);
    showStatus(cropToolEnabled ? '✂️ القص مفعّل — اسحب الإطار أو غيّر حجمه بالمقابض' : 'تم إيقاف القص', 'info');
  });
  document.getElementById('frameCropToggleBtn')?.addEventListener('click', () => {
    setCropToolEnabled(!cropToolEnabled);
    showStatus(cropToolEnabled ? '✂️ القص مفعّل — اسحب الإطار أو غيّر حجمه بالمقابض' : 'تم إيقاف القص', 'info');
  });

  document.getElementById('thumbZoomInBtn')?.addEventListener('click', () => {
    thumbZoomScale = Math.min(5, +(thumbZoomScale + 0.25).toFixed(2));
    applyPreviewZoomTransforms();
  });
  document.getElementById('thumbZoomOutBtn')?.addEventListener('click', () => {
    thumbZoomScale = Math.max(0.4, +(thumbZoomScale - 0.25).toFixed(2));
    applyPreviewZoomTransforms();
  });
  document.getElementById('thumbZoomResetBtn')?.addEventListener('click', () => {
    thumbZoomScale = 1;
    applyPreviewZoomTransforms();
  });
  document.getElementById('thumbFullscreenBtn')?.addEventListener('click', () => {
    imageMode = 'thumbnail';
    openCurrentImageFullscreen();
  });

  document.getElementById('frameZoomInBtn')?.addEventListener('click', () => {
    frameZoomScale = Math.min(5, +(frameZoomScale + 0.25).toFixed(2));
    applyPreviewZoomTransforms();
  });
  document.getElementById('frameZoomOutBtn')?.addEventListener('click', () => {
    frameZoomScale = Math.max(0.4, +(frameZoomScale - 0.25).toFixed(2));
    applyPreviewZoomTransforms();
  });
  document.getElementById('frameZoomResetBtn')?.addEventListener('click', () => {
    frameZoomScale = 1;
    applyPreviewZoomTransforms();
  });
  document.getElementById('frameFullscreenBtn')?.addEventListener('click', () => {
    imageMode = 'frame';
    openCurrentImageFullscreen();
  });

  bindPreviewPanZoom('thumbImgContainer', () => thumbZoomScale, (v) => { thumbZoomScale = v; });
  bindPreviewPanZoom('frameImgContainer', () => frameZoomScale, (v) => { frameZoomScale = v; });

  // Fullscreen modal zoom / pan / editor controls
  document.getElementById('closeFullscreenModalBtn')?.addEventListener('click', closeImageFullscreenModal);
  document.getElementById('fsCropToggleBtn')?.addEventListener('click', () => {
    closeAllFsPopovers();
    setCropToolEnabled(!cropToolEnabled);
  });
  document.getElementById('fsDimToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFsPopover('fsDimPopover', 'fsDimToggleBtn');
  });
  document.getElementById('fsTimeToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFsPopover('fsTimePopover', 'fsTimeToggleBtn');
  });
  document.getElementById('fsDimPopover')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('fsTimePopover')?.addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('imageFullscreenModal')?.addEventListener('click', (e) => {
    if (!e.target.closest('.fs-dim-wrap') && !e.target.closest('.fs-time-wrap')) {
      closeAllFsPopovers();
    }
  });
  document.getElementById('fsZoomInBtn')?.addEventListener('click', () => {
    fsZoomScale = Math.min(8, +(fsZoomScale + 0.25).toFixed(2));
    updateFsTransform();
  });
  document.getElementById('fsZoomOutBtn')?.addEventListener('click', () => {
    fsZoomScale = Math.max(0.25, +(fsZoomScale - 0.25).toFixed(2));
    updateFsTransform();
  });
  document.getElementById('fsZoomResetBtn')?.addEventListener('click', () => {
    fsZoomScale = 1;
    fsPan = { x: 0, y: 0 };
    updateFsTransform();
  });

  const fsStage = document.getElementById('fullscreenStage');
  if (fsStage && !fsStage.dataset.bound) {
    fsStage.dataset.bound = 'true';
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    fsStage.addEventListener('wheel', (e) => {
      e.preventDefault();
      fsZoomScale = e.deltaY < 0
        ? Math.min(8, +(fsZoomScale + 0.2).toFixed(2))
        : Math.max(0.25, +(fsZoomScale - 0.2).toFixed(2));
      updateFsTransform();
    }, { passive: false });

    fsStage.addEventListener('mousedown', (e) => {
      if (e.target.closest('.crop-overlay') || e.target.closest('.crop-handle')) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      fsStage.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      fsPan.x += e.clientX - lastX;
      fsPan.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      updateFsTransform();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      if (fsStage) fsStage.style.cursor = 'grab';
    });
  }

  document.getElementById('imageFullscreenModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'imageFullscreenModal') closeImageFullscreenModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageFullscreenModal();
  });

  const applyAspectFromPill = (aspect) => {
    imageAspect = aspect || 'default';
    if (cropToolEnabled) {
      fitCropRectToAspect();
      syncCropOverlays();
    }
    applyAspectToPreviewScreens();
    updateFsEditorControlsUI();
  };

  document.querySelectorAll('#aspectPills .aspect-pill, #fsAspectPills .aspect-pill').forEach((pill) => {
    pill.addEventListener('click', () => applyAspectFromPill(pill.dataset.aspect));
  });

  document.querySelectorAll('#outputSizePills .size-pill, #fsSizePills .size-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      imageOutputSize = pill.dataset.size || 'original';
      applyAspectToPreviewScreens();
      updateFsEditorControlsUI();
    });
  });

  document.querySelectorAll('#maskShapePills .mask-shape-pill, #fsMaskPills .mask-shape-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      maskShape = pill.dataset.shape || 'rect';
      updateMaskShapeUI();
      updateFsEditorControlsUI();
    });
  });

  const syncCustomDims = (fromFs) => {
    const wMain = document.getElementById('customAspectWidth');
    const hMain = document.getElementById('customAspectHeight');
    const wFs = document.getElementById('fsCustomWidth');
    const hFs = document.getElementById('fsCustomHeight');
    if (fromFs) {
      if (wMain && wFs) wMain.value = wFs.value;
      if (hMain && hFs) hMain.value = hFs.value;
    } else {
      if (wFs && wMain) wFs.value = wMain.value;
      if (hFs && hMain) hFs.value = hMain.value;
    }
    updateAspectBadge();
    updateFsEditorControlsUI();
  };

  ['customAspectWidth', 'customAspectHeight'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => syncCustomDims(false));
  });
  ['fsCustomWidth', 'fsCustomHeight'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => syncCustomDims(true));
  });

  const onFsFrameTime = () => {
    const fsRange = document.getElementById('fsFrameTimeRange');
    refreshFullscreenFrameAt(Number(fsRange?.value) || 0);
  };
  document.getElementById('fsFrameTimeRange')?.addEventListener('input', onFsFrameTime);
  document.getElementById('fsFrameTimeInput')?.addEventListener('change', () => {
    const fsInput = document.getElementById('fsFrameTimeInput');
    refreshFullscreenFrameAt(parseTimecode(fsInput?.value || '0'));
  });

  applyAspectToPreviewScreens();
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
  addToCopiedLinksHistory(url);
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
  addToCopiedLinksHistory(url);
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

  if (/netflix\.com/i.test(url)) {
    showStatus(t('netflixDrmBlocked'), 'error');
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
  const preferred = getPreferredDefaultQuality();
  const preferredHeight = preferred === 'best' ? null : Number(preferred);
  let preferredCard = null;

  if (Number.isFinite(preferredHeight) && preferredHeight > 0) {
    const matchFormat = sorted
      .filter((f) => (f.height || 0) <= preferredHeight)
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (matchFormat) {
      preferredCard = [...grid.querySelectorAll('.quality-option')]
        .find((card) => card.dataset.formatId === String(matchFormat.formatId || matchFormat.height));
    }
  }

  createQualityCard({
    label: t('bestQuality'),
    formatText: formatLabel,
    sizeText: t('highestQuality'),
    type,
    format: { formatId: 'best', height: 'best' },
    grid,
    autoSelect: !preferredCard,
    badge: t('badgeBest')
  });

  if (preferredCard) {
    preferredCard.click();
  }
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

  createTierHeader(grid, { key: 'best', label: t('tierAudioBest') });
  createQualityCard({
    label: t('bestAudioQuality'),
    formatText: 'MP3',
    sizeText: t('highestAudio'),
    type: 'audio',
    format: { formatId: 'best', abr: 'best' },
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
  if (type === 'audio') {
    selectedHeight = null;
    selectedAbr = format.abr === 'best' || format.formatId === 'best'
      ? 'best'
      : (format.abr || format.formatId || 'best');
  } else {
    selectedHeight = format.height || format.formatId || 'best';
    selectedAbr = 'best';
  }
  selectedHasAudio = type === 'video-audio';
  updatePreviewActiveBadge();
  maybeRefreshOpenPreview();
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
      aspectRatio: imageAspect === 'custom' ? 'default' : imageAspect,
      outputSize: imageOutputSize,
      maskShape,
      cropEnabled: cropToolEnabled,
      cropRect: cropToolEnabled ? { ...cropRect } : null,
      cropPos: cropPositionPercent,
      customWidth: parseInt(document.getElementById('customAspectWidth')?.value, 10) || 1080,
      customHeight: parseInt(document.getElementById('customAspectHeight')?.value, 10) || 1080,
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
      abr: selectedType === 'audio' ? selectedAbr : undefined,
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
      updateQuickPlayButtonLabel();
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
      const openLabel = document.getElementById('openDownloadedFileLabel');
      if (openLabel) {
        openLabel.textContent = studioMode === 'image' ? 'فتح الصورة' : 'فتح الملف';
      }
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

// —— Favorites (preferred channels) ——
const FAVORITES_KEY = 'vmFavoriteChannels';
const FAVORITES_CHECK_INTERVAL_MS = 15 * 60 * 1000;
let favoriteChannels = [];
let favoritesExpandedId = null;
let favoritesChecking = false;
let favoritesCheckTimer = null;

function tf(key, vars = {}) {
  let s = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  });
  return s;
}

function normalizeFavoriteUrl(raw) {
  const cleaned = String(raw || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  const u = new URL(withProto);
  u.hash = '';
  let href = u.toString();
  if (href.endsWith('/') && u.pathname !== '/') {
    href = href.slice(0, -1);
  }
  return href;
}

function favoriteUrlKey(url) {
  try {
    const u = new URL(normalizeFavoriteUrl(url));
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    u.protocol = 'https:';
    u.hash = '';
    u.search = '';
    let path = u.pathname.replace(/\/+$/, '') || '/';
    path = path.replace(/\/(videos|streams|shorts|releases|playlists)$/i, '');
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

function guessChannelNameFromUrl(url) {
  try {
    const u = new URL(url);
    const m =
      u.pathname.match(/\/@([^/]+)/) ||
      u.pathname.match(/\/c\/([^/]+)/) ||
      u.pathname.match(/\/user\/([^/]+)/) ||
      u.pathname.match(/\/channel\/([^/]+)/) ||
      u.pathname.match(/\/([^/]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function loadFavoriteChannels() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (!Array.isArray(raw)) {
      favoriteChannels = [];
      return;
    }
    favoriteChannels = raw
      .filter((c) => c && c.url)
      .map((c, i) => ({
        id: String(c.id || `fav_${Date.now()}_${i}`),
        url: String(c.url),
        name: String(c.name || guessChannelNameFromUrl(c.url)),
        lastSeenIds: Array.isArray(c.lastSeenIds) ? c.lastSeenIds.map(String) : [],
        unread: Array.isArray(c.unread)
          ? c.unread.map((u) => ({
              id: String(u.id),
              title: String(u.title || u.id),
              url: String(u.url || ''),
              addedAt: Number(u.addedAt) || Date.now()
            }))
          : [],
        lastChecked: Number(c.lastChecked) || 0,
        notifyEnabled: c.notifyEnabled !== false
      }));
  } catch {
    favoriteChannels = [];
  }
}

function saveFavoriteChannels() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteChannels));
}

function getFavoritesTotalUnread() {
  return favoriteChannels.reduce((sum, c) => sum + (c.unread?.length || 0), 0);
}

function updateFavoritesNavBadge() {
  const badge = document.getElementById('navFavoritesBadge');
  if (!badge) return;
  const total = getFavoritesTotalUnread();
  if (total > 0) {
    badge.hidden = false;
    badge.textContent = total > 99 ? '99+' : String(total);
  } else {
    badge.hidden = true;
    badge.textContent = '0';
  }
}

function renderFavoritesList() {
  const list = document.getElementById('favoritesList');
  if (!list) return;

  if (favoriteChannels.length === 0) {
    list.innerHTML = `
      <div class="favorites-empty">
        <i class="fas fa-star"></i>
        <p>${escapeHtml(t('favoritesEmpty'))}</p>
      </div>
    `;
    updateFavoritesNavBadge();
    return;
  }

  list.innerHTML = favoriteChannels.map((ch, index) => {
    const unreadCount = ch.unread?.length || 0;
    const expanded = favoritesExpandedId === ch.id && unreadCount > 0;
    const host = (() => {
      try { return new URL(ch.url).hostname.replace(/^www\./, ''); } catch { return ''; }
    })();
    const unreadItems = (ch.unread || []).map((v) => `
      <div class="fav-unread-item">
        <button type="button" class="fav-unread-open" data-id="${escapeHtml(ch.id)}" data-video-url="${escapeHtml(v.url)}">
          <i class="fas fa-play-circle"></i>
          <span>${escapeHtml(v.title)}</span>
        </button>
      </div>
    `).join('');

    return `
      <div class="fav-channel-card${unreadCount ? ' has-unread' : ''}" data-id="${escapeHtml(ch.id)}">
        <div class="fav-channel-main">
          <div class="fav-channel-reorder">
            <button type="button" class="fav-move-up" data-id="${escapeHtml(ch.id)}" title="${escapeHtml(t('favoritesMoveUp'))}" ${index === 0 ? 'disabled' : ''}>
              <i class="fas fa-chevron-up"></i>
            </button>
            <button type="button" class="fav-move-down" data-id="${escapeHtml(ch.id)}" title="${escapeHtml(t('favoritesMoveDown'))}" ${index === favoriteChannels.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-chevron-down"></i>
            </button>
          </div>
          <div class="fav-channel-info">
            <button type="button" class="fav-channel-name" data-id="${escapeHtml(ch.id)}" data-url="${escapeHtml(ch.url)}" title="${escapeHtml(ch.url)}">
              ${escapeHtml(ch.name)}
            </button>
            <span class="fav-channel-host">${escapeHtml(host)}</span>
          </div>
          <div class="fav-channel-actions">
            <button type="button" class="fav-bell-btn${unreadCount ? ' has-badge' : ''}" data-id="${escapeHtml(ch.id)}" title="${escapeHtml(unreadCount ? tf('favoritesUnread', { count: unreadCount }) : t('favoritesCheckOne'))}">
              <i class="fas fa-bell"></i>
              ${unreadCount ? `<span class="fav-bell-count">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
            </button>
            <button type="button" class="fav-check-btn" data-id="${escapeHtml(ch.id)}" title="${escapeHtml(t('favoritesCheckOne'))}">
              <i class="fas fa-sync-alt"></i>
            </button>
            <button type="button" class="fav-delete-btn" data-id="${escapeHtml(ch.id)}" title="${escapeHtml(t('favoritesDelete'))}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        ${expanded ? `
          <div class="fav-unread-panel">
            <div class="fav-unread-head">
              <span>${escapeHtml(tf('favoritesUnread', { count: unreadCount }))}</span>
              <button type="button" class="fav-mark-read" data-id="${escapeHtml(ch.id)}">${escapeHtml(t('favoritesMarkRead'))}</button>
            </div>
            <div class="fav-unread-list">${unreadItems}</div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  bindFavoritesActions();
  updateFavoritesNavBadge();
}

function bindFavoritesActions() {
  const list = document.getElementById('favoritesList');
  if (!list) return;

  list.querySelectorAll('.fav-move-up').forEach((btn) => {
    btn.addEventListener('click', () => moveFavoriteChannel(btn.dataset.id, -1));
  });
  list.querySelectorAll('.fav-move-down').forEach((btn) => {
    btn.addEventListener('click', () => moveFavoriteChannel(btn.dataset.id, 1));
  });
  list.querySelectorAll('.fav-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeFavoriteChannel(btn.dataset.id));
  });
  list.querySelectorAll('.fav-check-btn').forEach((btn) => {
    btn.addEventListener('click', () => checkFavoriteChannel(btn.dataset.id, true));
  });
  list.querySelectorAll('.fav-bell-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleFavoriteUnreadPanel(btn.dataset.id));
  });
  list.querySelectorAll('.fav-mark-read').forEach((btn) => {
    btn.addEventListener('click', () => markFavoriteRead(btn.dataset.id));
  });
  list.querySelectorAll('.fav-channel-name').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (!url) return;
      navigateTo('downloader');
      elements.videoUrl.value = url;
      elements.videoUrl.focus();
      showStatus(url, 'info');
    });
  });
  list.querySelectorAll('.fav-unread-open').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const videoUrl = btn.dataset.videoUrl;
      const channelId = btn.dataset.id;
      if (!videoUrl) return;
      markFavoriteVideoRead(channelId, videoUrl);
      navigateTo('downloader');
      elements.videoUrl.value = videoUrl;
      try {
        await fetchVideoInfo();
      } catch {
        /* status already shown */
      }
    });
  });
}

function moveFavoriteChannel(id, delta) {
  const index = favoriteChannels.findIndex((c) => c.id === id);
  if (index < 0) return;
  const next = index + delta;
  if (next < 0 || next >= favoriteChannels.length) return;
  const [item] = favoriteChannels.splice(index, 1);
  favoriteChannels.splice(next, 0, item);
  saveFavoriteChannels();
  renderFavoritesList();
}

function removeFavoriteChannel(id) {
  favoriteChannels = favoriteChannels.filter((c) => c.id !== id);
  if (favoritesExpandedId === id) favoritesExpandedId = null;
  saveFavoriteChannels();
  renderFavoritesList();
  showStatus(t('favoritesRemoved'), 'success');
}

function toggleFavoriteUnreadPanel(id) {
  const ch = favoriteChannels.find((c) => c.id === id);
  if (!ch) return;
  if (!(ch.unread?.length)) {
    checkFavoriteChannel(id, true);
    return;
  }
  favoritesExpandedId = favoritesExpandedId === id ? null : id;
  renderFavoritesList();
}

function markFavoriteRead(id) {
  const ch = favoriteChannels.find((c) => c.id === id);
  if (!ch) return;
  const seen = new Set(ch.lastSeenIds || []);
  (ch.unread || []).forEach((v) => seen.add(v.id));
  ch.lastSeenIds = Array.from(seen).slice(0, 40);
  ch.unread = [];
  if (favoritesExpandedId === id) favoritesExpandedId = null;
  saveFavoriteChannels();
  renderFavoritesList();
}

function markFavoriteVideoRead(channelId, videoUrl) {
  const ch = favoriteChannels.find((c) => c.id === channelId);
  if (!ch) return;
  const removed = (ch.unread || []).filter((v) => v.url === videoUrl);
  ch.unread = (ch.unread || []).filter((v) => v.url !== videoUrl);
  removed.forEach((v) => {
    if (!ch.lastSeenIds.includes(v.id)) ch.lastSeenIds.unshift(v.id);
  });
  ch.lastSeenIds = ch.lastSeenIds.slice(0, 40);
  if (!(ch.unread.length) && favoritesExpandedId === channelId) {
    favoritesExpandedId = null;
  }
  saveFavoriteChannels();
  renderFavoritesList();
}

async function addFavoriteChannelsFromText(text) {
  const urls = extractUrlsFromText(text);
  if (!urls.length) {
    showStatus('الرابط غير صالح', 'error');
    return;
  }

  const existing = new Set(favoriteChannels.map((c) => favoriteUrlKey(c.url)));
  const toAdd = [];
  for (const raw of urls) {
    try {
      const url = normalizeFavoriteUrl(raw);
      const key = favoriteUrlKey(url);
      if (existing.has(key)) continue;
      existing.add(key);
      toAdd.push({
        id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        name: guessChannelNameFromUrl(url),
        lastSeenIds: [],
        unread: [],
        lastChecked: 0,
        notifyEnabled: true
      });
    } catch {
      /* skip bad url */
    }
  }

  if (!toAdd.length) {
    showStatus(t('favoritesExists'), 'info');
    return;
  }

  favoriteChannels = [...toAdd, ...favoriteChannels];
  saveFavoriteChannels();
  renderFavoritesList();

  const input = document.getElementById('favoriteChannelInput');
  if (input) input.value = '';

  showStatus(
    toAdd.length === 1 ? t('favoritesAdded') : tf('favoritesAddedMany', { count: toAdd.length }),
    'success'
  );

  for (const ch of toAdd) {
    await checkFavoriteChannel(ch.id, false, true);
  }
}

async function checkFavoriteChannel(id, manual = false, seedOnly = false) {
  const ch = favoriteChannels.find((c) => c.id === id);
  if (!ch || !window.electronAPI.checkChannelUpdates) return { ok: false };

  try {
    const result = await window.electronAPI.checkChannelUpdates({ url: ch.url, limit: 8 });
    if (!result?.success) {
      if (manual) showStatus(result?.error || t('favoritesChecked'), 'error');
      return { ok: false, error: result?.error };
    }

    const entries = result.data?.entries || [];
    if (result.data?.name && result.data.name !== ch.name) {
      ch.name = result.data.name;
    }
    ch.lastChecked = Date.now();

    const seen = new Set(ch.lastSeenIds || []);
    const isFirstSeed = seedOnly || seen.size === 0;

    if (isFirstSeed) {
      ch.lastSeenIds = entries.map((e) => e.id).slice(0, 40);
      ch.unread = [];
    } else {
      const fresh = [];
      for (const entry of entries) {
        if (!seen.has(entry.id)) {
          fresh.push({
            id: entry.id,
            title: entry.title,
            url: entry.url,
            addedAt: Date.now()
          });
        }
      }
      if (fresh.length) {
        const existingUnreadIds = new Set((ch.unread || []).map((u) => u.id));
        const merged = [...fresh.filter((f) => !existingUnreadIds.has(f.id)), ...(ch.unread || [])];
        ch.unread = merged.slice(0, 30);
        fresh.forEach((f) => seen.add(f.id));
        ch.lastSeenIds = Array.from(seen).slice(0, 40);

        if (isNotificationsEnabled() && ch.notifyEnabled) {
          window.electronAPI.showNotification?.({
            title: tf('favoritesNewVideos', { name: ch.name }),
            body: fresh[0].title + (fresh.length > 1 ? ` (+${fresh.length - 1})` : '')
          });
        }
        favoritesExpandedId = ch.id;
      } else if (manual) {
        showStatus(t('favoritesNoNew'), 'info');
      }
    }

    saveFavoriteChannels();
    renderFavoritesList();
    return { ok: true, newCount: isFirstSeed ? 0 : (ch.unread?.length || 0) };
  } catch (error) {
    if (manual) showStatus(error.message || t('favoritesChecked'), 'error');
    return { ok: false, error: error.message };
  }
}

async function checkAllFavoriteChannels(manual = false) {
  if (favoritesChecking || !favoriteChannels.length) {
    if (manual && !favoriteChannels.length) showStatus(t('favoritesEmpty'), 'info');
    return;
  }
  favoritesChecking = true;
  const btn = document.getElementById('checkAllFavoritesBtn');
  if (btn) btn.disabled = true;
  if (manual) showStatus(t('favoritesChecking'), 'info');

  try {
    for (const ch of [...favoriteChannels]) {
      await checkFavoriteChannel(ch.id, false, false);
    }
    if (manual) showStatus(t('favoritesChecked'), 'success');
  } finally {
    favoritesChecking = false;
    if (btn) btn.disabled = false;
  }
}

function bindFavoritesUi() {
  const addBtn = document.getElementById('addFavoriteBtn');
  const pasteBtn = document.getElementById('pasteFavoriteBtn');
  const checkAllBtn = document.getElementById('checkAllFavoritesBtn');
  const input = document.getElementById('favoriteChannelInput');

  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = 'true';
    addBtn.addEventListener('click', () => {
      addFavoriteChannelsFromText(input?.value || '');
    });
  }

  if (pasteBtn && !pasteBtn.dataset.bound) {
    pasteBtn.dataset.bound = 'true';
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (input) {
          input.value = input.value ? `${input.value.trim()}\n${text}` : text;
        }
        await addFavoriteChannelsFromText(text);
      } catch (error) {
        showStatus(error.message || t('favoritesPaste'), 'error');
      }
    });
  }

  if (checkAllBtn && !checkAllBtn.dataset.bound) {
    checkAllBtn.dataset.bound = 'true';
    checkAllBtn.addEventListener('click', () => checkAllFavoriteChannels(true));
  }

  if (input && !input.dataset.bound) {
    input.dataset.bound = 'true';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addFavoriteChannelsFromText(input.value);
      }
    });
  }
}

function startFavoritesAutoCheck() {
  if (favoritesCheckTimer) clearInterval(favoritesCheckTimer);
  favoritesCheckTimer = setInterval(() => {
    if (appReady && favoriteChannels.length) {
      checkAllFavoriteChannels(false);
    }
  }, FAVORITES_CHECK_INTERVAL_MS);
}

function initFavorites() {
  loadFavoriteChannels();
  bindFavoritesUi();
  renderFavoritesList();
  startFavoritesAutoCheck();
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
    favorites: t('pageFavorites'),
    tools: t('pageTools'),
    settings: t('pageSettings')
  };
  elements.pageTitle.textContent = titles[section] || 'VM';
  if (section === 'settings') initEnhancedSettings();
  if (section === 'favorites') renderFavoritesList();
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

  elements.platformsGrid.innerHTML = platforms.map((p) => `
    <button type="button" class="platform-card" data-platform-url="${escapeHtml(p.url || '')}" title="فتح الموقع الرسمي لـ ${escapeHtml(p.name)}">
      <i class="${getPlatformIconClass(p.name)}"></i>
      <h4>${escapeHtml(p.name)}</h4>
      <span class="platform-card-hint">${isLivePlatform(p.name) ? 'لايف / VOD · الموقع الرسمي' : 'الموقع الرسمي'}</span>
    </button>
  `).join('');

  elements.platformsGrid.querySelectorAll('.platform-card[data-platform-url]').forEach((card) => {
    card.addEventListener('click', () => openOfficialPlatformSite(card.dataset.platformUrl, card.querySelector('h4')?.textContent));
  });
}

async function openOfficialPlatformSite(url, name = '') {
  if (!url) {
    showStatus('لا يوجد رابط رسمي لهذه المنصة', 'info');
    return;
  }
  try {
    const result = await window.electronAPI.openExternalUrl?.(url);
    if (result?.success === false) {
      showStatus(result.error || 'تعذر فتح الموقع الرسمي', 'error');
      return;
    }
    if (name) showStatus(`جاري فتح ${name}...`, 'info');
  } catch (err) {
    showStatus(err?.message || 'تعذر فتح الموقع الرسمي', 'error');
  }
}

function isLivePlatform(name) {
  return ['Kick', 'Twitch', 'Trovo', 'YouTube', 'Rumble', 'Facebook'].includes(name);
}

function getPlatformIconClass(name) {
  const icons = {
    'YouTube': 'fab fa-youtube',
    'Instagram': 'fab fa-instagram',
    'TikTok': 'fab fa-tiktok',
    'Pinterest': 'fab fa-pinterest',
    'Facebook': 'fab fa-facebook',
    'Twitter / X': 'fab fa-twitter',
    'SoundCloud': 'fab fa-soundcloud',
    'Spotify': 'fab fa-spotify',
    'Twitch': 'fab fa-twitch',
    'Kick': 'fas fa-bolt',
    'Trovo': 'fas fa-gamepad',
    'LinkedIn': 'fab fa-linkedin',
    'Threads': 'fab fa-at',
    'Rumble': 'fas fa-broadcast-tower',
    'VK': 'fab fa-vk',
    'Telegram': 'fab fa-telegram',
    'Bilibili': 'fas fa-tv',
    'Vimeo': 'fab fa-vimeo',
    'Dailymotion': 'fab fa-dailymotion',
    'Reddit': 'fab fa-reddit',
    'Streamable': 'fas fa-play-circle',
    'Odysee': 'fas fa-satellite-dish'
  };
  return icons[name] || 'fas fa-globe';
}

function bindPlatformTagLinks() {
  document.querySelectorAll('.platform-tags .tag[data-platform-url]').forEach((tag) => {
    tag.addEventListener('click', () => {
      openOfficialPlatformSite(tag.dataset.platformUrl, tag.dataset.platformName || tag.textContent.trim());
    });
  });
}

// Paste from clipboard
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    elements.videoUrl.value = text;
    const urls = extractUrlsFromText(text);
    urls.forEach((u) => addToCopiedLinksHistory(u));
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
  selectedAbr = 'best';
  selectedHasAudio = true;
  updateWelcomePanel();
}

// New download
function newDownload() {
  clearAll();
  elements.videoUrl.focus();
}

function formatPreviewQualityLabel(height) {
  if (!height || height === 'best') return t('bestQuality') || 'أقصى جودة';
  const n = Number(height);
  if (Number.isFinite(n) && n > 0) {
    if (n >= 4320) return `${n}p · 8K`;
    if (n >= 2160) return `${n}p · 4K`;
    if (n >= 1440) return `${n}p · 2K`;
    if (n >= 1080) return `${n}p · Full HD`;
    return `${n}p`;
  }
  if (typeof height === 'string' && /^\d+$/.test(height)) return `${height}p`;
  return String(height);
}

function getPreviewSummaryText() {
  if (studioMode === 'clip') {
    clampClipRange();
    const clipTypeLabel = getActiveDownloadType() === 'video-only' ? 'مقطع بدون صوت' : 'مقطع مع صوت';
    return `قص مقطع · ${formatShortTime(clipStart)} ← ${formatShortTime(clipEnd)} · ${clipTypeLabel}`;
  }
  if (studioMode === 'image') {
    if (imageMode === 'frame') {
      return `لقطة · ${formatTimecode(frameTime)} · ${imageFormat.toUpperCase()}`;
    }
    return `صورة مصغرة · ${imageFormat.toUpperCase()}`;
  }
  const typeText = getActiveDownloadType() === 'audio'
    ? 'صوت MP3'
    : (getActiveDownloadType() === 'video-only' ? 'فيديو فقط' : 'فيديو + صوت');
  const qualityText = getActiveDownloadType() === 'audio'
    ? formatPreviewQualityLabel(selectedAbr || 'best')
    : formatPreviewQualityLabel(selectedHeight || 'best');
  return `${qualityText} · ${typeText}`;
}

function updatePreviewActiveBadge() {
  if (!elements.previewActiveBadge) return;
  elements.previewActiveBadge.textContent = getPreviewSummaryText();
}

function isPreviewPlayerOpen() {
  return !!(elements.previewPlayerBox && !elements.previewPlayerBox.classList.contains('hidden'));
}

function maybeRefreshOpenPreview() {
  if (!currentVideoInfo || !isPreviewPlayerOpen()) return;
  // أعد تطبيق الجودة/النوع على المعاينة المفتوحة
  toggleVideoPreview(true);
}

let currentSubBlobUrl = null;
let previewTimeUpdateListener = null;

// Video Preview
async function toggleVideoPreview(forceRefresh = false) {
  if (!currentVideoInfo) return;
  if (!forceRefresh && isPreviewPlayerOpen()) {
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
  const activeType = getActiveDownloadType();
  const options = {
    mode: studioMode,
    type: activeType,
    height: selectedHeight || 'best',
    abr: selectedAbr || 'best',
    format: selectedFormat,
    forceRefresh: !!forceRefresh
  };

  updatePreviewActiveBadge();
  showStatus(t('previewApplying') || 'جاري تطبيق الإعدادات على المعاينة...', 'info');

  try {
    const res = await window.electronAPI.getStreamUrl({ url, options });
    if (res.success && res.url) {
      if (elements.previewVideoEl) {
        if (previewTimeUpdateListener) {
          elements.previewVideoEl.removeEventListener('timeupdate', previewTimeUpdateListener);
          previewTimeUpdateListener = null;
        }

        Array.from(elements.previewVideoEl.querySelectorAll('track')).forEach((tr) => tr.remove());
        if (currentSubBlobUrl) {
          URL.revokeObjectURL(currentSubBlobUrl);
          currentSubBlobUrl = null;
        }

        elements.previewVideoEl.src = res.url;
        elements.previewVideoEl.poster = currentVideoInfo.thumbnail || currentVideoInfo.thumbnailUrl || '';
        elements.previewPlayerBox?.classList.remove('hidden');

        // طبّق نوع التحميل على تشغيل المعاينة
        if (activeType === 'video-only') {
          elements.previewVideoEl.muted = true;
          elements.previewVideoEl.volume = 0;
        } else if (activeType === 'audio') {
          elements.previewVideoEl.muted = false;
          elements.previewVideoEl.volume = 1;
          // صوت فقط: لا تعتمد على صورة الفيديو
          elements.previewVideoEl.poster = '';
        } else {
          elements.previewVideoEl.muted = false;
          elements.previewVideoEl.volume = 1;
        }

        if (studioMode === 'clip' && videoDuration > 0) {
          clampClipRange();
          elements.previewVideoEl.currentTime = clipStart;
          previewTimeUpdateListener = () => {
            if (elements.previewVideoEl.currentTime >= clipEnd) {
              elements.previewVideoEl.currentTime = clipStart;
            }
          };
          elements.previewVideoEl.addEventListener('timeupdate', previewTimeUpdateListener);
        }

        if (studioMode === 'image') {
          if (imageMode === 'frame') {
            elements.previewVideoEl.currentTime = Math.max(0, Math.min(frameTime, videoDuration || frameTime));
            elements.previewVideoEl.pause();
            showStatus(`تمت معاينة اللقطة المحددة من الوقت ${formatTimecode(frameTime)} بصيغة ${imageFormat.toUpperCase()}`, 'success');
            return;
          }
        }

        elements.previewVideoEl.load();
        if (studioMode !== 'image') {
          elements.previewVideoEl.play().catch(() => {});
        }
      }

      const applied = getPreviewSummaryText();
      showStatus(`تم تطبيق المعاينة: ${applied}`, 'success');
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

function createBatchQueueItem(urlStr) {
  return {
    id: 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
    url: urlStr,
    status: 'pending',
    quality: 'best',
    type: 'video-audio',
    filename: '',
    error: null,
    showEditor: false
  };
}

function syncQueueUrlSet() {
  downloadQueueUrlSet = new Set(downloadQueue.map((q) => q.url));
}

function enqueueBatchUrl(urlStr) {
  if (downloadQueueUrlSet.has(urlStr)) return false;
  downloadQueueUrlSet.add(urlStr);
  downloadQueue.push(createBatchQueueItem(urlStr));
  return true;
}

function scheduleUpdateQueueUI(immediate = false) {
  if (immediate) {
    if (queueUiTimer) {
      clearTimeout(queueUiTimer);
      queueUiTimer = null;
    }
    updateQueueUI();
    return;
  }
  if (queueUiTimer) return;
  queueUiTimer = setTimeout(() => {
    queueUiTimer = null;
    updateQueueUI();
  }, 120);
}

function pruneCompletedBatchItems() {
  const completed = downloadQueue.filter((q) => q.status === 'done' || q.status === 'error');
  if (completed.length <= BATCH_KEEP_COMPLETED) return false;

  const toRemove = completed.slice(0, completed.length - BATCH_KEEP_COMPLETED);
  const removeIds = new Set(toRemove.map((q) => q.id));
  for (const item of toRemove) {
    downloadQueueUrlSet.delete(item.url);
    batchSelectedIds.delete(item.id);
  }
  downloadQueue = downloadQueue.filter((q) => !removeIds.has(q.id));
  return true;
}

function getVisibleBatchEntries() {
  const total = downloadQueue.length;
  if (total === 0) return { entries: [], totalPages: 1, start: 0, end: 0 };

  const totalPages = Math.max(1, Math.ceil(total / BATCH_UI_PAGE_SIZE));
  if (batchUiPage >= totalPages) batchUiPage = totalPages - 1;
  if (batchUiPage < 0) batchUiPage = 0;

  const start = batchUiPage * BATCH_UI_PAGE_SIZE;
  const end = Math.min(total, start + BATCH_UI_PAGE_SIZE);
  const indexSet = new Set();
  for (let i = start; i < end; i++) indexSet.add(i);

  downloadQueue.forEach((q, i) => {
    if (q.status === 'downloading' || q.showEditor || batchSelectedIds.has(q.id)) {
      indexSet.add(i);
    }
  });

  const entries = [...indexSet].sort((a, b) => a - b).map((idx) => ({
    item: downloadQueue[idx],
    idx
  }));

  return { entries, totalPages, start, end, total };
}

window.setBatchQueuePage = function(page, event) {
  if (event) event.stopPropagation();
  batchUiPage = Math.max(0, Number(page) || 0);
  scheduleUpdateQueueUI(true);
};

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
  syncQueueUrlSet();
  syncBatchSelection();
  scheduleUpdateQueueUI(true);
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
  if (item) downloadQueueUrlSet.delete(item.url);
  downloadQueue = downloadQueue.filter((q) => q.id !== itemId && q.url !== itemId);
  batchSelectedIds.delete(itemId);
  syncBatchSelection();
  scheduleUpdateQueueUI(true);
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
    const nextUrl = urlInput.value.trim();
    try {
      const normalized = new URL(nextUrl.startsWith('http') ? nextUrl : `https://${nextUrl}`).toString();
      if (normalized !== item.url) {
        if (downloadQueueUrlSet.has(normalized) && normalized !== item.url) {
          showStatus('هذا الرابط موجود مسبقاً في القائمة', 'info');
        } else {
          downloadQueueUrlSet.delete(item.url);
          downloadQueueUrlSet.add(normalized);
          item.url = normalized;
        }
      }
    } catch {
      showStatus('الرابط غير صالح', 'error');
      return;
    }
  }
  if (typeSelect) item.type = typeSelect.value;
  // عند التحويل لصوت والقيمة كانت دقة فيديو شائعة — اضبط لأقصى صوت
  if (qualitySelect) {
    const q = qualitySelect.value;
    if (item.type === 'audio' && ['144', '240', '360', '480', '720', '1080', '1440', '2160', '4320'].includes(q)) {
      item.quality = 'best';
    } else if (item.type !== 'audio' && ['64', '96', '128', '160', '192', '256', '320'].includes(q)) {
      item.quality = 'best';
    } else {
      item.quality = q;
    }
  }
  if (filenameInput) item.filename = filenameInput.value.trim();

  item.showEditor = false;
  scheduleUpdateQueueUI(true);
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
            ${renderBatchQualityOptions('best', 'bulk')}
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
    batchUiPage = 0;
    elements.batchQueueList.innerHTML = `<p class="batch-desc">${t('batchDesc')}</p>`;
    if (elements.startBatchBtn) {
      elements.startBatchBtn.disabled = true;
      elements.startBatchBtn.classList.remove('hidden');
    }
    if (elements.stopBatchBtn) elements.stopBatchBtn.classList.add('hidden');
    return;
  }

  const pendingCount = downloadQueue.filter((q) => q.status === 'pending').length;
  const sessionDone = batchSessionStats.done;
  const sessionError = batchSessionStats.error;
  const selectedCount = batchSelectedIds.size;
  const allSelected = selectedCount === downloadQueue.length && downloadQueue.length > 0;
  const { entries, totalPages, start, end, total } = getVisibleBatchEntries();

  if (elements.startBatchBtn) {
    elements.startBatchBtn.disabled = isQueueProcessing || pendingCount === 0;
    elements.startBatchBtn.classList.toggle('hidden', isQueueProcessing);
  }
  if (elements.stopBatchBtn) {
    elements.stopBatchBtn.classList.toggle('hidden', !isQueueProcessing);
  }

  const nextPendingId = downloadQueue.find((q) => q.status === 'pending')?.id;

  const headerHtml = `
    <div class="batch-queue-summary">
      <span>
        القائمة: <strong>${total}</strong>
        (انتظار: ${pendingCount} | مكتمل بالجلسة: ${sessionDone} | فشل: ${sessionError})
      </span>
      <span class="batch-queue-hint">بدون حد أقصى — أكثر من 1000 فيديو في نفس الجلسة</span>
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
    ${totalPages > 1 ? `
      <div class="batch-pagination">
        <button type="button" class="btn-batch-page" onclick="setBatchQueuePage(${batchUiPage - 1}, event)" ${batchUiPage <= 0 ? 'disabled' : ''}>
          <i class="fas fa-chevron-right"></i>
        </button>
        <span>صفحة ${batchUiPage + 1} / ${totalPages} (عرض ${start + 1}–${end} من ${total})</span>
        <button type="button" class="btn-batch-page" onclick="setBatchQueuePage(${batchUiPage + 1}, event)" ${batchUiPage >= totalPages - 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i>
        </button>
      </div>
    ` : ''}
    ${renderBulkEditorHtml()}
  `;

  const itemsHtml = entries.map(({ item, idx }) => {
    const statusText = item.status === 'pending'
      ? 'انتظار'
      : (item.status === 'downloading'
        ? 'جاري التحميل...'
        : (item.status === 'done' ? 'اكتمل ✓' : 'خطأ ✗'));
    const statusTitle = item.status === 'error' && item.error ? escapeHtml(item.error) : '';
    const isCustomized = (item.quality && item.quality !== 'best') || (item.type && item.type !== 'video-audio') || item.filename;
    const badgeText = isCustomized
      ? ` [${item.type === 'audio' ? `${item.quality === 'best' ? 'MP3 Max' : item.quality + 'kbps'}` : item.quality + 'p'}]`
      : '';
    const isSelected = batchSelectedIds.has(item.id);
    const isNext = item.status === 'pending' && item.id === nextPendingId;
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
            <span class="batch-item-status ${item.status}" title="${statusTitle}">${statusText}</span>
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
                  ${renderBatchQualityOptions(item.quality || 'best', item.type || 'video-audio')}
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

  if (lines.length === 0) {
    showStatus('ألصق روابط في المربع أولاً (رابط في كل سطر)', 'info');
    return 0;
  }

  let added = 0;
  let invalid = 0;
  const newlyAdded = [];

  for (const line of lines) {
    try {
      const parsed = new URL(line.startsWith('http') ? line : `https://${line}`);
      const urlStr = parsed.toString();
      if (enqueueBatchUrl(urlStr)) {
        newlyAdded.push(urlStr);
        added += 1;
      }
    } catch {
      invalid += 1;
    }
  }

  if (elements.batchUrlsText) elements.batchUrlsText.value = '';

  // لا نُثقل الحافظة المحلية عند إضافة آلاف الروابط دفعة واحدة
  if (newlyAdded.length > 0) {
    addToCopiedLinksHistory(newlyAdded.slice(0, 30));
  }

  scheduleUpdateQueueUI(true);
  if (added > 0) {
    showStatus(`تمت إضافة ${added} رابط إلى سلسلة التنزيل التلقائي (الإجمالي: ${downloadQueue.length})`, 'success');
  } else if (invalid > 0) {
    showStatus('لم يتم العثور على روابط صالحة في النص', 'error');
  } else {
    showStatus('الروابط موجودة مسبقاً في القائمة', 'info');
  }
  return added;
}

async function pasteAndAddUrlsToQueue() {
  const textareaHasText = !!(elements.batchUrlsText?.value || '').trim();

  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      if (elements.batchUrlsText) {
        const current = elements.batchUrlsText.value ? elements.batchUrlsText.value + '\n' : '';
        elements.batchUrlsText.value = current + text.trim();
      }
      addUrlsToQueue();
      return;
    }

    if (textareaHasText) {
      addUrlsToQueue();
      return;
    }

    showStatus(t('errClipboard'), 'error');
  } catch (err) {
    if (textareaHasText) {
      addUrlsToQueue();
      return;
    }
    showStatus(t('errClipboard'), 'error');
  }
}

function clearCompletedBatchItems() {
  const removedItems = downloadQueue.filter((q) => q.status === 'done' || q.status === 'error');
  if (removedItems.length === 0) {
    showStatus('لا توجد عناصر مكتملة أو فاشلة لمسحها', 'info');
    return;
  }
  for (const item of removedItems) {
    downloadQueueUrlSet.delete(item.url);
    batchSelectedIds.delete(item.id);
  }
  downloadQueue = downloadQueue.filter((q) => q.status !== 'done' && q.status !== 'error');
  syncBatchSelection();
  scheduleUpdateQueueUI(true);
  showStatus(`تم مسح ${removedItems.length} عنصر مكتمل/فاشل من العرض (عداد الجلسة محفوظ)`, 'success');
}

function clearBatchQueue() {
  if (isQueueProcessing || downloadQueue.some((q) => q.status === 'downloading')) {
    showStatus('أوقف السلسلة أولاً أو انتظر انتهاء التحميل الحالي قبل إفراغ القائمة', 'info');
    return;
  }
  downloadQueue = [];
  downloadQueueUrlSet.clear();
  batchSelectedIds.clear();
  showBulkEditor = false;
  batchUiPage = 0;
  batchSessionStats = { done: 0, error: 0, processed: 0 };
  scheduleUpdateQueueUI(true);
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

// ─── Copied links history (اختيار من الروابط المنسوخة) ───────────────────────
const COPIED_LINKS_KEY = 'vm_copied_links_history';
const COPIED_LINKS_MAX = 200;
let copiedLinksHistory = [];

function loadCopiedLinksHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(COPIED_LINKS_KEY) || '[]');
    copiedLinksHistory = Array.isArray(raw) ? raw.filter((u) => typeof u === 'string') : [];
  } catch {
    copiedLinksHistory = [];
  }
}

function saveCopiedLinksHistory() {
  localStorage.setItem(COPIED_LINKS_KEY, JSON.stringify(copiedLinksHistory.slice(0, COPIED_LINKS_MAX)));
}

function extractUrlsFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const found = [];
  const seen = new Set();
  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const m of matches) {
    const cleaned = m.replace(/[.,;!?)\]]+$/g, '');
    try {
      const url = new URL(cleaned).toString();
      if (!seen.has(url)) {
        seen.add(url);
        found.push(url);
      }
    } catch { /* skip */ }
  }
  if (found.length === 0) {
    try {
      const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`).toString();
      found.push(url);
    } catch { /* skip */ }
  }
  return found;
}

function addToCopiedLinksHistory(url) {
  const urls = Array.isArray(url) ? url : [url];
  let changed = false;
  for (const raw of urls) {
    try {
      const u = new URL(String(raw).trim()).toString();
      copiedLinksHistory = copiedLinksHistory.filter((x) => x !== u);
      copiedLinksHistory.unshift(u);
      changed = true;
    } catch { /* skip */ }
  }
  if (!changed) return;
  if (copiedLinksHistory.length > COPIED_LINKS_MAX) {
    copiedLinksHistory = copiedLinksHistory.slice(0, COPIED_LINKS_MAX);
  }
  saveCopiedLinksHistory();
  renderCopiedLinksDropdown();
}

function updateCopiedLinksBadge() {
  const badge = document.getElementById('copiedLinksBadge');
  if (!badge) return;
  const n = copiedLinksHistory.length;
  if (n > 0) {
    badge.hidden = false;
    badge.textContent = n > 99 ? '99+' : String(n);
  } else {
    badge.hidden = true;
  }
}

function renderCopiedLinksDropdown() {
  const list = document.getElementById('copiedLinksList');
  updateCopiedLinksBadge();
  if (!list) return;

  if (copiedLinksHistory.length === 0) {
    list.innerHTML = '<p class="copied-links-empty">لا توجد روابط منسوخة بعد — انسخ رابطاً أو فعّل اللصق التلقائي</p>';
    return;
  }

  list.innerHTML = copiedLinksHistory.map((url, idx) => {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = 'رابط'; }
    return `
      <button type="button" class="copied-link-item" data-url="${escapeHtml(url)}" title="${escapeHtml(url)}">
        <span class="copied-link-idx">${idx + 1}</span>
        <span class="copied-link-meta">
          <strong>${escapeHtml(host)}</strong>
          <small>${escapeHtml(url)}</small>
        </span>
        <i class="fas fa-search"></i>
      </button>
    `;
  }).join('');
}

function toggleCopiedLinksDropdown(force) {
  const dropdown = document.getElementById('copiedLinksDropdown');
  const btn = document.getElementById('copiedLinksBtn');
  if (!dropdown) return;
  const open = typeof force === 'boolean' ? force : dropdown.classList.contains('hidden');
  dropdown.classList.toggle('hidden', !open);
  btn?.classList.toggle('active', open);
  if (open) renderCopiedLinksDropdown();
}

function selectCopiedLinkAndSearch(url) {
  if (!url || !elements.videoUrl) return;
  elements.videoUrl.value = url;
  toggleCopiedLinksDropdown(false);
  addToCopiedLinksHistory(url);
  fetchVideoInfo();
}

function bindCopiedLinksUI() {
  loadCopiedLinksHistory();
  renderCopiedLinksDropdown();

  document.getElementById('copiedLinksBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCopiedLinksDropdown();
  });

  document.getElementById('clearCopiedLinksBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    copiedLinksHistory = [];
    saveCopiedLinksHistory();
    renderCopiedLinksDropdown();
    showStatus('تم مسح قائمة الروابط المنسوخة', 'info');
  });

  document.getElementById('copiedLinksList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.copied-link-item');
    if (!item?.dataset?.url) return;
    e.preventDefault();
    selectCopiedLinkAndSearch(item.dataset.url);
  });

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('copiedLinksWrap');
    if (wrap && !wrap.contains(e.target)) {
      toggleCopiedLinksDropdown(false);
    }
  });
}

function addAutoPasteUrlsToQueue(urls) {
  if (!autoPasteBatchEnabled || !Array.isArray(urls) || urls.length === 0) return;

  let added = 0;
  let lastUrl = '';
  const newlyAdded = [];

  for (const raw of urls) {
    try {
      const urlStr = new URL(String(raw).trim()).toString();
      if (!enqueueBatchUrl(urlStr)) continue;
      newlyAdded.push(urlStr);
      added += 1;
      lastUrl = urlStr;
    } catch {
      // skip invalid
    }
  }

  if (added > 0) {
    if (newlyAdded.length > 0) addToCopiedLinksHistory(newlyAdded.slice(0, 20));
    scheduleUpdateQueueUI(false);
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
  if (isQueueProcessing) return;

  if (downloadQueue.length === 0 && (elements.batchUrlsText?.value || '').trim()) {
    addUrlsToQueue();
  }

  if (downloadQueue.length === 0) {
    showStatus('أضف روابط للقائمة أولاً ثم ابدأ التحميل', 'info');
    return;
  }

  const pendingCount = downloadQueue.filter((q) => q.status === 'pending').length;
  if (pendingCount === 0) {
    showStatus('لا توجد روابط بانتظار التحميل في القائمة', 'info');
    return;
  }

  batchStopRequested = false;
  isQueueProcessing = true;
  showStatus(`بدء التحميل التلقائي لـ ${pendingCount} رابط (بدون حد أقصى للجلسة)...`, 'info');
  scheduleUpdateQueueUI(true);
  await processNextBatchItem();
}

async function stopBatchProcessing() {
  if (!isQueueProcessing) return;
  batchStopRequested = true;
  try {
    await window.electronAPI.cancelDownload?.();
  } catch {
    // ignore
  }
  showStatus('جارٍ إيقاف السلسلة بعد إنهاء/إلغاء العنصر الحالي...', 'info');
  scheduleUpdateQueueUI(true);
}

async function processNextBatchItem() {
  if (batchStopRequested) {
    isQueueProcessing = false;
    batchStopRequested = false;
    scheduleUpdateQueueUI(true);
    showStatus(
      `تم إيقاف السلسلة — نجح ${batchSessionStats.done} | فشل ${batchSessionStats.error} | متبقي ${downloadQueue.filter((q) => q.status === 'pending').length}`,
      'info'
    );
    return;
  }

  const item = downloadQueue.find((q) => q.status === 'pending');
  if (!item) {
    isQueueProcessing = false;
    scheduleUpdateQueueUI(true);
    const pendingLeft = downloadQueue.filter((q) => q.status === 'pending').length;
    if (batchSessionStats.error > 0) {
      showStatus(
        `انتهى التحميل: نجح ${batchSessionStats.done} | فشل ${batchSessionStats.error}` +
          (pendingLeft ? ` | متبقي ${pendingLeft}` : ''),
        batchSessionStats.done === 0 ? 'error' : 'info'
      );
    } else {
      showStatus(`اكتمل تحميل السلسلة بنجاح! (${batchSessionStats.done} فيديو)`, 'success');
    }
    return;
  }

  item.status = 'downloading';
  item.error = null;
  scheduleUpdateQueueUI(true);

  try {
    if (elements.videoUrl) elements.videoUrl.value = item.url;
    const customType = item.type || selectedType || 'video-audio';
    if (/netflix\.com/i.test(item.url || '')) {
      item.status = 'error';
      item.error = t('netflixDrmBlocked');
      batchSessionStats.error += 1;
      batchSessionStats.processed += 1;
      showStatus(t('netflixDrmBlocked'), 'error');
      pruneCompletedBatchItems();
      scheduleUpdateQueueUI(true);
      setTimeout(() => processNextBatchItem(), BATCH_ITEM_DELAY_MS);
      return;
    }
    const customHeight = item.quality || selectedHeight || 'best';
    const ext = customType === 'audio' ? '.mp3' : '.mp4';
    const customName = (item.filename || '').trim();
    const finalFilename = customName ? `${customName}${ext}` : '%(title)s.%(ext)s';

    const options = {
      mode: 'full',
      format: customType === 'audio' ? (item.quality === 'best' || !item.quality ? 'best' : null) : null,
      height: customType === 'audio' ? null : customHeight,
      abr: customType === 'audio' ? (item.quality || 'best') : undefined,
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

    if (batchStopRequested) {
      if (result?.success) {
        item.status = 'done';
        item.error = null;
        batchSessionStats.done += 1;
      } else {
        item.status = 'pending';
        item.error = null;
      }
      batchSessionStats.processed += 1;
    } else if (result?.success) {
      item.status = 'done';
      item.error = null;
      batchSessionStats.done += 1;
      batchSessionStats.processed += 1;
    } else {
      item.status = 'error';
      item.error = result?.error || t('errDownloadFailed') || 'فشل التحميل';
      batchSessionStats.error += 1;
      batchSessionStats.processed += 1;
      showStatus(`فشل رابط (${batchSessionStats.processed}): ${item.error}`, 'error');
    }
  } catch (err) {
    console.error('Batch item error:', err);
    if (batchStopRequested && /cancel|killed|abort|إلغاء/i.test(String(err?.message || ''))) {
      item.status = 'pending';
      item.error = null;
    } else {
      item.status = 'error';
      item.error = err?.message || t('errDownloadFailed') || 'فشل التحميل';
      batchSessionStats.error += 1;
      batchSessionStats.processed += 1;
      showStatus(`فشل رابط (${batchSessionStats.processed}): ${item.error}`, 'error');
    }
  } finally {
    pruneCompletedBatchItems();
    scheduleUpdateQueueUI(true);
    setTimeout(() => {
      processNextBatchItem();
    }, BATCH_ITEM_DELAY_MS);
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
elements.addBatchBtn?.addEventListener('click', addUrlsToQueue);
elements.startBatchBtn?.addEventListener('click', startBatchProcessing);
elements.stopBatchBtn?.addEventListener('click', stopBatchProcessing);
elements.clearCompletedBatchBtn?.addEventListener('click', clearCompletedBatchItems);
elements.clearBatchBtn?.addEventListener('click', clearBatchQueue);

const handleQuickPlay = async () => {
  if (!lastDownloadedPath) {
    showStatus('لا يوجد ملف محمّل بعد', 'info');
    return;
  }
  try {
    const result = await window.electronAPI.openPath(lastDownloadedPath);
    if (result && result.success === false) {
      showStatus(result.error || 'تعذر فتح الملف — تم فتح المجلد', 'error');
    }
  } catch (err) {
    showStatus(err.message || 'تعذر فتح الملف', 'error');
  }
};

function updateQuickPlayButtonLabel() {
  const label = document.getElementById('quickPlayBtnLabel');
  const btn = elements.quickPlayBtn;
  const isImage = studioMode === 'image' || /\.(png|jpe?g|webp|gif|bmp)$/i.test(lastDownloadedPath || '');
  if (label) label.textContent = isImage ? 'فتح الصورة' : 'فتح الملف';
  if (btn) {
    btn.title = isImage ? 'فتح الصورة المحمّلة' : 'فتح الملف المحمّل';
    const icon = btn.querySelector('i');
    if (icon) icon.className = isImage ? 'fas fa-image' : 'fas fa-external-link-alt';
  }
}

elements.quickPlayBtn?.addEventListener('click', handleQuickPlay);
elements.settingsQuickPlayBtn?.addEventListener('click', handleQuickPlay);
document.getElementById('openDownloadedFileBtn')?.addEventListener('click', handleQuickPlay);
document.getElementById('showDownloadedFolderBtn')?.addEventListener('click', () => {
  if (lastDownloadedPath) {
    window.electronAPI.showItemInFolder(lastDownloadedPath);
  } else {
    showStatus('لا يوجد ملف محمّل بعد', 'info');
  }
});

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
    setTimeout(() => {
      if (favoriteChannels.length) checkAllFavoriteChannels(false);
    }, 8000);
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
  const defaultQualitySelect = document.getElementById('defaultQuality');

  if (defaultQualitySelect) {
    defaultQualitySelect.value = getPreferredDefaultQuality();
    defaultQualitySelect.addEventListener('change', () => {
      const value = defaultQualitySelect.value || 'best';
      localStorage.setItem(DEFAULT_VIDEO_QUALITY_KEY, value);
      showStatus(
        value === 'best'
          ? 'الافتراضي: أقصى جودة بدون سقف (حتى 8K إن توفرت)'
          : `الجودة الافتراضية: ${value}p`,
        'success'
      );
    });
  }

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
  renderFavoritesList();

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
  bindCopiedLinksUI();
  bindSettingsEvents();
  await window.electronAPI.setClipboardWatch?.(isClipboardWatchEnabled());
  await loadDefaultDownloadPath();
  loadPlatforms();
  bindPlatformTagLinks();
  initFavorites();

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
