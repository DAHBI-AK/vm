const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const TTS_CHUNK_SIZE = 200;

const TTS_DIALECT_CODES = {
  'ar': 'ar',
  'ar-SA': 'ar-SA',
  'ar-MA': 'ar-MA',
  'ar-EG': 'ar-EG',
  'ar-DZ': 'ar-DZ',
  'ar-SY': 'ar-SY',
  'en': 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'fr': 'fr-FR',
  'fr-FR': 'fr-FR',
  'fr-CA': 'fr-CA',
  'es': 'es-ES',
  'es-ES': 'es-ES',
  'de': 'de-DE',
  'de-DE': 'de-DE'
};

const VOICE_PROFILES = {
  'auto': '',
  'female-soft': 'asetrate=44100*1.06,aresample=44100,equalizer=f=3000:t=q:w=1:g=2',
  'female-normal': 'asetrate=44100*1.02,aresample=44100',
  'male-normal': 'asetrate=44100*0.88,aresample=44100,equalizer=f=150:t=q:w=1:g=2',
  'male-deep': 'asetrate=44100*0.78,aresample=44100,equalizer=f=100:t=q:w=1:g=4',
  'young-energetic': 'asetrate=44100*1.12,aresample=44100,equalizer=f=2500:t=q:w=1:g=2'
};

function splitText(text, maxLen = TTS_CHUNK_SIZE) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const chunks = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function httpsGetBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...headers } }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        httpsGetBuffer(response.headers.location, headers).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function translateText(text, targetLang) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }

  const langCode = targetLang.split('-')[0];
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(langCode)}&dt=t&q=${encodeURIComponent(trimmed)}`;
  
  try {
    const buffer = await httpsGetBuffer(url);
    const data = JSON.parse(buffer.toString('utf8'));

    if (!Array.isArray(data?.[0])) {
      return trimmed;
    }

    return data[0].map((part) => part?.[0] || '').join('').trim() || trimmed;
  } catch {
    return trimmed;
  }
}

async function translateTextBatch(cues, targetLang) {
  if (!cues || cues.length === 0) {
    return [];
  }

  const batchSize = 15;
  const results = new Array(cues.length);
  const langCode = targetLang.split('-')[0];

  for (let i = 0; i < cues.length; i += batchSize) {
    const slice = cues.slice(i, i + batchSize);
    const combined = slice.map((c) => c.text.replace(/\n/g, ' ')).join(' ||| ');

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(langCode)}&dt=t&q=${encodeURIComponent(combined)}`;
      const buffer = await httpsGetBuffer(url);
      const data = JSON.parse(buffer.toString('utf8'));

      let fullTranslated = '';
      if (Array.isArray(data?.[0])) {
        fullTranslated = data[0].map((part) => part?.[0] || '').join('');
      }

      const parts = fullTranslated.split(/\s*\|\|\|\s*/);
      if (parts.length === slice.length) {
        slice.forEach((c, idx) => {
          results[i + idx] = parts[idx].trim() || c.text;
        });
      } else {
        for (let j = 0; j < slice.length; j += 1) {
          results[i + j] = await translateText(slice[j].text, targetLang);
        }
      }
    } catch {
      for (let j = 0; j < slice.length; j += 1) {
        results[i + j] = await translateText(slice[j].text, targetLang);
      }
    }
  }

  return results;
}

async function googleTtsToFile(text, langCode, outputPath) {
  const chunks = splitText(text);
  if (chunks.length === 0) {
    throw new Error('لا يوجد نص للتحويل إلى صوت');
  }

  const ttsLang = TTS_DIALECT_CODES[langCode] || langCode.split('-')[0];

  const fetchTtsChunk = async (chunk, attempt = 0) => {
    try {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(ttsLang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      return await httpsGetBuffer(ttsUrl);
    } catch (error) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        return fetchTtsChunk(chunk, attempt + 1);
      }
      throw error;
    }
  };

  if (chunks.length === 1) {
    const buffer = await fetchTtsChunk(chunks[0]);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  const partPaths = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const partPath = `${outputPath}.part${index}.mp3`;
    const buffer = await fetchTtsChunk(chunks[index]);
    fs.writeFileSync(partPath, buffer);
    partPaths.push(partPath);
  }

  await concatAudioFiles(partPaths, outputPath, path.dirname(outputPath));
  partPaths.forEach((partPath) => {
    try {
      fs.unlinkSync(partPath);
    } catch {
      // ignore
    }
  });

  return outputPath;
}

function parseVttTime(value) {
  const str = String(value || '').trim().replace(',', '.');
  const parts = str.split(':');

  if (parts.length === 3) {
    const hours = Number(parts[0] || 0);
    const minutes = Number(parts[1] || 0);
    const seconds = Number(parts[2] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  if (parts.length === 2) {
    const minutes = Number(parts[0] || 0);
    const seconds = Number(parts[1] || 0);
    return (minutes * 60) + seconds;
  }

  return Number(str) || 0;
}

function cleanSubtitleText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^)]+\)/g, '')
    .replace(/[♪♫🎵#]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVtt(content) {
  const cues = [];
  const blocks = String(content || '').replace(/\r/g, '').split('\n\n');

  blocks.forEach((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) {
      return;
    }

    const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((part) => part.trim().split(' ')[0]);
    const text = cleanSubtitleText(lines.slice(timeLineIndex + 1).join(' '));

    if (!text) {
      return;
    }

    cues.push({
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text
    });
  });

  return cleanRollingCues(dedupeCues(cues.filter((cue) => cue.end > cue.start)));
}

function parseSrt(content) {
  const cues = [];
  const blocks = String(content || '').replace(/\r/g, '').split('\n\n');

  blocks.forEach((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return;
    }

    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) {
      return;
    }

    const [startRaw, endRaw] = lines[timeLineIndex].split('-->').map((part) => part.trim().replace(',', '.'));
    const text = cleanSubtitleText(lines.slice(timeLineIndex + 1).join(' '));

    if (!text) {
      return;
    }

    cues.push({
      start: parseVttTime(startRaw),
      end: parseVttTime(endRaw),
      text
    });
  });

  return cleanRollingCues(dedupeCues(cues.filter((cue) => cue.end > cue.start)));
}

function cleanRollingCues(cues) {
  if (!cues || cues.length === 0) return [];
  const cleaned = [];

  for (let i = 0; i < cues.length; i++) {
    const current = cues[i];
    const next = cues[i + 1];

    if (next && next.text.toLowerCase().startsWith(current.text.toLowerCase())) {
      continue;
    }

    const last = cleaned[cleaned.length - 1];
    if (last && current.start < last.end) {
      if (current.text.toLowerCase().startsWith(last.text.toLowerCase())) {
        last.end = current.end;
        last.text = current.text;
        continue;
      }
    }

    cleaned.push({ ...current });
  }

  return cleaned;
}

function dedupeCues(cues) {
  const unique = [];

  cues.forEach((cue) => {
    const previous = unique[unique.length - 1];
    if (
      previous
      && Math.abs(previous.start - cue.start) < 0.05
      && Math.abs(previous.end - cue.end) < 0.05
      && previous.text === cue.text
    ) {
      return;
    }
    unique.push(cue);
  });

  return unique;
}

function parseSubtitleFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.toLowerCase().endsWith('.srt')) {
    return parseSrt(content);
  }
  return parseVtt(content);
}

function mergeShortCues(cues, minDuration = 1.6) {
  if (!cues || cues.length <= 1) {
    return cues || [];
  }

  const merged = [];
  let buffer = null;

  cues.forEach((cue) => {
    if (!cue || !cue.text) return;

    if (!buffer) {
      buffer = { ...cue };
      return;
    }

    const bufferDuration = buffer.end - buffer.start;
    const gap = cue.start - buffer.end;

    if (bufferDuration < minDuration || gap < 0.6) {
      buffer.end = Math.max(buffer.end, cue.end);
      buffer.text = `${buffer.text} ${cue.text}`.trim();
    } else {
      merged.push(buffer);
      buffer = { ...cue };
    }
  });

  if (buffer) {
    merged.push(buffer);
  }

  return merged;
}

function pickSubtitleFile(dir, baseName, languages = []) {
  if (!fs.existsSync(dir)) {
    return null;
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.vtt') || file.endsWith('.srt'));
  if (files.length === 0) {
    return null;
  }

  const ranked = [];

  files.forEach((file) => {
    const lower = file.toLowerCase();
    languages.forEach((lang, index) => {
      if (lower.includes(`.${lang}.`) || lower.endsWith(`.${lang}.vtt`) || lower.endsWith(`.${lang}.srt`)) {
        ranked.push({ file: path.join(dir, file), score: index });
      }
    });
  });

  if (ranked.length > 0) {
    ranked.sort((a, b) => a.score - b.score);
    return ranked[0].file;
  }

  const fallback = files.find((file) => /(\.en\.|\.a\.en\.)/i.test(file))
    || files.find((file) => /\.[\w-]+\.(vtt|srt)$/i.test(file))
    || files[0];

  return fallback ? path.join(dir, fallback) : null;
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function generateSyntheticCues(ffmpegPath, videoPath, totalDuration = 30, targetLang = 'ar') {
  return [];
}

function getMediaDuration(ffmpegPath, filePath) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath], { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        resolve(0);
        return;
      }

      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      resolve((hours * 3600) + (minutes * 60) + seconds);
    });
  });
}

async function generateSilence(ffmpegPath, durationSec, outputPath) {
  const duration = Math.max(0.1, durationSec);
  await runFfmpeg(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(duration.toFixed(3)),
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-y',
    outputPath
  ]);
}

async function applyVoiceProfile(ffmpegPath, inputPath, voiceProfileKey, outputPath) {
  const filter = VOICE_PROFILES[voiceProfileKey];
  if (!filter) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  await runFfmpeg(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-af', filter,
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-y',
    outputPath
  ]);
}

async function adjustAudioSpeed(ffmpegPath, inputPath, speedFactor, outputPath) {
  const factor = Math.max(0.5, Math.min(2.0, speedFactor || 1));
  await runFfmpeg(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-filter:a', `atempo=${factor.toFixed(3)}`,
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-y',
    outputPath
  ]);
}

async function concatAudioFiles(files, outputPath, workDir, ffmpegPath) {
  const listPath = path.join(workDir, `concat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.txt`);
  const listContent = files.map((file) => `file '${file.replace(/'/g, "''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  try {
    await runFfmpeg(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputPath
    ]);
  } finally {
    try {
      fs.unlinkSync(listPath);
    } catch {
      // ignore
    }
  }
}

async function buildSequentialDubbedAudio({
  cues,
  targetLang,
  dubVoice = 'auto',
  dubSpeed = '1.0',
  dubSyncGap = '0.2',
  totalDuration,
  workDir,
  ffmpegPath,
  onProgress
}) {
  const ttsLang = TTS_DIALECT_CODES[targetLang] || targetLang;

  onProgress?.(35, `جاري ترجمة ${cues.length} مقطع نصي بالذكاء الاصطناعي...`);
  const translatedTexts = await translateTextBatch(cues, targetLang);

  const concatFiles = [];
  let currentTime = 0;
  const userSpeed = Math.max(0.7, Math.min(2.0, Number(dubSpeed) || 1.0));
  const syncGapOffset = Math.max(-0.5, Math.min(2.0, Number(dubSyncGap) || 0.2));

  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const translated = translatedTexts[index] || cue.text;

    const progress = 40 + Math.round((index / Math.max(1, cues.length)) * 48);
    onProgress?.(progress, `جاري توليد الصوت (${index + 1}/${cues.length}): ${translated.slice(0, 30)}...`);

    const gap = Math.max(0, (cue.start - currentTime) + (index > 0 ? syncGapOffset : 0));
    if (gap > 0.05) {
      const silencePath = path.join(workDir, `silence_${index}.mp3`);
      await generateSilence(ffmpegPath, gap, silencePath);
      concatFiles.push(silencePath);
      currentTime += gap;
    }

    const rawPath = path.join(workDir, `seg_raw_${index}.mp3`);
    const voicedPath = path.join(workDir, `seg_voiced_${index}.mp3`);
    const finalPath = path.join(workDir, `seg_final_${index}.mp3`);

    try {
      await googleTtsToFile(translated, ttsLang, rawPath);
    } catch (err) {
      console.warn(`TTS failed for cue ${index}, skipping:`, err.message);
      continue;
    }

    await applyVoiceProfile(ffmpegPath, rawPath, dubVoice, voicedPath);

    const cueDuration = Math.max(0.5, cue.end - cue.start);
    const audioDuration = await getMediaDuration(ffmpegPath, voicedPath);

    let actualDuration = audioDuration;
    const speedFactor = userSpeed !== 1.0 ? (userSpeed * Math.max(1.0, audioDuration / cueDuration)) : (audioDuration > cueDuration * 1.15 ? Math.min(2.0, audioDuration / cueDuration) : 1.0);

    if (speedFactor !== 1.0) {
      await adjustAudioSpeed(ffmpegPath, voicedPath, Math.min(2.0, Math.max(0.5, speedFactor)), finalPath);
      actualDuration = await getMediaDuration(ffmpegPath, finalPath);
      concatFiles.push(finalPath);
    } else {
      concatFiles.push(voicedPath);
    }

    currentTime += actualDuration;

    try {
      if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
    } catch {
      // ignore
    }
  }

  if (totalDuration && currentTime < totalDuration) {
    const trailingGap = totalDuration - currentTime;
    if (trailingGap > 0.1) {
      const trailingSilence = path.join(workDir, `silence_end.mp3`);
      await generateSilence(ffmpegPath, trailingGap, trailingSilence);
      concatFiles.push(trailingSilence);
    }
  }

  if (concatFiles.length === 0) {
    throw new Error('فشل إنشاء القنوات الصوتية للترجمة والدبلجة');
  }

  onProgress?.(90, 'دمج الصوت النهائي بسلاسة بدون تأخير...');
  const finalAudioPath = path.join(workDir, 'ai_dubbed_audio.m4a');
  await concatAudioFiles(concatFiles, finalAudioPath, workDir, ffmpegPath);

  return finalAudioPath;
}

async function downloadAiDubbedVideo({
  url,
  options,
  outputDir,
  helpers
}) {
  const {
    normalizeUrl,
    getYtDlpBaseArgs,
    getSpeedArgs,
    getVideoOnlySelector,
    spawnYtDlpDownload,
    runYtDlp,
    mergeVideoWithDubAudio,
    cleanupTempFiles,
    sendDownloadProgress,
    ffmpegPath
  } = helpers;

  const normalizedUrl = normalizeUrl(url);
  const output = path.join(outputDir, options.filename);
  const tempId = Date.now();
  const workDir = path.join(outputDir, `._v1_ai_${tempId}`);
  const tempVideo = path.join(workDir, 'video.mp4');
  const subBase = path.join(workDir, 'subs');
  const targetLang = options.dubLanguage || 'ar';
  const dubVoice = options.dubVoice || 'auto';

  fs.mkdirSync(workDir, { recursive: true });

  const baseArgs = [
    ...getYtDlpBaseArgs(normalizedUrl),
    ...getSpeedArgs({ turbo: options.turbo !== false }),
    '--newline',
    '--progress'
  ];

  const tempFiles = [workDir];

  try {
    sendDownloadProgress(0, { message: 'تحميل الفيديو مع الصوت الأصلي لعزل التأثيرات والموسيقى...' });
    await spawnYtDlpDownload([
      ...baseArgs,
      '-f', helpers.getVideoWithAudioSelector ? helpers.getVideoWithAudioSelector(options) : 'bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', tempVideo,
      normalizedUrl
    ], { progressStart: 0, progressEnd: 28 });

    const videoDuration = await getMediaDuration(ffmpegPath, tempVideo);

    sendDownloadProgress(30, { message: 'جلب الترجمة والتسميات التوضيحية للفيديو...' });
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
    } catch (subErr) {
      console.warn('Notice during sub download (proceeding with available subs):', subErr.message);
    }

    const subtitleFile = pickSubtitleFile(workDir, 'subs', [
      options.originalLanguage,
      targetLang,
      'en',
      'ar',
      'fr'
    ].filter(Boolean));

    let cues = [];
    if (subtitleFile) {
      cues = parseSubtitleFile(subtitleFile);
      cues = mergeShortCues(cues);
    }

    if (!cues || cues.length === 0) {
      sendDownloadProgress(35, { message: 'توليد المزامنة والنطق التلقائي من الصوت الأصلي للفيديو...' });
      cues = await generateSyntheticCues(ffmpegPath, tempVideo, videoDuration, targetLang);
    }

    const dubSpeed = options.dubSpeed || '1.0';
    const dubSyncGap = options.dubSyncGap || '0.2';

    const dubbedAudio = await buildSequentialDubbedAudio({
      cues,
      targetLang,
      dubVoice,
      dubSpeed,
      dubSyncGap,
      totalDuration: videoDuration,
      workDir,
      ffmpegPath,
      onProgress: (progress, message) => sendDownloadProgress(progress, { message })
    });

    let srtSubPath = null;
    if (options.mode === 'dub_and_sub') {
      try {
        const translatedTexts = await translateTextBatch(cues, targetLang);
        const translatedCues = cues.map((c, idx) => ({ ...c, text: translatedTexts[idx] || c.text }));
        srtSubPath = path.join(workDir, 'translated_burn.srt');
        fs.writeFileSync(srtSubPath, buildSrtContent(translatedCues), 'utf-8');
      } catch (srtErr) {
        console.warn('Notice creating burn-in subtitles:', srtErr.message);
      }
    }

    sendDownloadProgress(92, { message: 'دمج الصوت المدبلج بالذكاء الاصطناعي والترجمة النصية المطبوعة مع حفظ الموسيقى والتأثيرات...' });
    await mergeVideoWithDubAudio(tempVideo, dubbedAudio, output, {
      preserveBackground: true,
      burnSubtitleFile: srtSubPath
    });
    sendDownloadProgress(100, { message: 'اكتملت الدبلجة والترجمة المدمجة بنجاح' });

    return { success: true, path: output };
  } finally {
    cleanupTempFiles(tempFiles);
  }
}

function formatSrtTime(seconds) {
  const pad = (num, len = 2) => String(Math.floor(num)).padStart(len, '0');
  const h = pad(seconds / 3600);
  const m = pad((seconds % 3600) / 60);
  const s = pad(seconds % 60);
  const ms = pad(Math.floor((seconds % 1) * 1000), 3);
  return `${h}:${m}:${s},${ms}`;
}

function buildSrtContent(cues) {
  return cues.map((cue, index) => {
    return `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`;
  }).join('\n');
}

module.exports = {
  downloadAiDubbedVideo,
  parseVtt,
  parseSubtitleFile,
  translateText,
  translateTextBatch,
  buildSrtContent,
  generateSyntheticCues
};
