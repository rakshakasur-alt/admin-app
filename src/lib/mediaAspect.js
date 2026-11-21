/**
 * Dish media rules (Add / Edit dish).
 *
 * Images
 *  • JPG or PNG only.
 *  • Only these shapes are accepted: 1:1, 4:3, 3:4, 16:9, 4:5, 5:4 — they fit
 *    the guest app's image box. Any other ratio is rejected (not cropped).
 *  • At most 10 MB of photos per dish (all photos together).
 *  • Every photo is compressed on upload to ~70% of its size or less
 *    (≈30% saved), re-encoded as JPEG, max 1600px on the long side.
 *
 * Videos
 *  • MP4 only.
 *  • 4:3, 3:4 and 16:9 are the main ratios; other ratios are still accepted
 *    (shown letterboxed) with a heads-up.
 *  • At most 15 MB of video per dish (all videos together).
 *  • Each video is re-encoded in the browser at ~70% of its bitrate when the
 *    browser can record MP4; otherwise the original MP4 is kept.
 */

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];
export const VIDEO_MIME_TYPES = ['video/mp4'];
export const VIDEO_EXTENSIONS = ['mp4'];
export const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB of photos per dish
export const MAX_TOTAL_VIDEO_BYTES = 15 * 1024 * 1024; // 15 MB of video per dish
// Compressed files must be at most this fraction of the original (≈30% saved)
export const COMPRESSION_TARGET = 0.7;

export function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(file) {
  return (file?.name || '').split('.').pop()?.toLowerCase() || '';
}

export function isAllowedImageFile(file) {
  return IMAGE_EXTENSIONS.includes(extOf(file)) && (!file.type || IMAGE_MIME_TYPES.includes(file.type));
}

export function isAllowedVideoFile(file) {
  return VIDEO_EXTENSIONS.includes(extOf(file)) && (!file.type || VIDEO_MIME_TYPES.includes(file.type));
}

export const IMAGE_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
];

export const VIDEO_MAIN_RATIOS = [
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
];

export const IMAGE_RATIO_HINT = IMAGE_RATIOS.map((r) => r.label).join(', ');
export const VIDEO_RATIO_HINT = VIDEO_MAIN_RATIOS.map((r) => r.label).join(', ');

// 3% tolerance: 1080×1350 is 4:5, 1920×1080 is 16:9, 1200×1199 is 1:1, etc.
const TOLERANCE = 0.03;

export function matchRatio(width, height, ratios) {
  if (!width || !height) return null;
  const r = width / height;
  return ratios.find((x) => Math.abs(r - x.value) / x.value <= TOLERANCE) || null;
}

export function nearestRatio(width, height, ratios) {
  const r = width / height;
  return ratios.reduce((best, x) =>
    Math.abs(Math.log(r / x.value)) < Math.abs(Math.log(r / best.value)) ? x : best
  , ratios[0]);
}

export function describeRatio(width, height) {
  if (!width || !height) return 'unknown';
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(Math.round(width), Math.round(height)) || 1;
  const a = Math.round(width / g);
  const b = Math.round(height / g);
  return a <= 40 && b <= 40 ? `${a}:${b}` : `${(width / height).toFixed(2)}:1`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read "${file.name}"`)); };
    img.src = url;
  });
}

// Upload compression: dish photos are shown at most ~1600px wide, menu-card
// thumbnails at ~600px. Output is JPEG (the accepted upload formats are
// JPG / PNG only).
export const FULL_MAX_SIDE = 1600;
export const FULL_QUALITY = 0.82;
export const THUMB_MAX_SIDE = 600;
export const THUMB_QUALITY = 0.72;

async function canvasToFile(canvas, baseName, quality) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error(`Could not process "${baseName}"`);
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/**
 * Draws the source rectangle (sx, sy, sw, sh) of `img` scaled so its longest
 * side is at most `maxSide` (never upscaled) and encodes it.
 */
async function encodeRegion(img, { sx = 0, sy = 0, sw, sh, maxSide, quality, baseName }) {
  const w = sw ?? img.naturalWidth;
  const h = sh ?? img.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // JPEG has no transparency — put transparent PNG areas on white, not black
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, w, h, 0, 0, canvas.width, canvas.height);
  return canvasToFile(canvas, baseName, quality);
}

function baseNameOf(file) {
  return (file.name || 'dish-photo').replace(/\.[^.]+$/, '');
}

/**
 * Re-encode a photo until it is at most COMPRESSION_TARGET of the original
 * size: first lower JPEG quality, then the resolution. Returns the smallest
 * result if the target can't be reached (tiny, already-optimised files).
 */
async function compressImage(img, file) {
  const target = file.size * COMPRESSION_TARGET;
  const qualities = [FULL_QUALITY, 0.74, 0.66, 0.58, 0.5];
  const sides = [FULL_MAX_SIDE, 1280, 1024];
  let best = null;
  for (const maxSide of sides) {
    for (const quality of qualities) {
      const out = await encodeRegion(img, { maxSide, quality, baseName: baseNameOf(file) });
      if (!best || out.size < best.size) best = out;
      if (out.size <= target) return out;
    }
  }
  return best;
}

/**
 * Small menu-card thumbnail (~600px JPEG) for a dish photo.
 * Returns null for unreadable files.
 */
export async function makeDishThumbnail(file) {
  if (!file) return null;
  let loaded;
  try { loaded = await loadImage(file); } catch (_) { return null; }
  try {
    return await encodeRegion(loaded.img, { maxSide: THUMB_MAX_SIDE, quality: THUMB_QUALITY, baseName: `${baseNameOf(file)}-thumb` });
  } catch (_) {
    return null;
  } finally {
    URL.revokeObjectURL(loaded.url);
  }
}

/**
 * Validates and compresses picked dish photos.
 *  • rejects anything that is not JPG / PNG
 *  • rejects anything that is not one of IMAGE_RATIOS (no auto-crop)
 *  • rejects the pick if it would take the dish over MAX_TOTAL_IMAGE_BYTES
 *  • compresses accepted photos by ≥30%
 * `existingBytes` = photos already queued for this dish.
 * Returns { files, notices, errors } — strings are shown to the owner.
 */
export async function prepareDishImages(files, { existingBytes = 0 } = {}) {
  const out = [];
  const notices = [];
  const errors = [];

  const formatOk = [];
  for (const file of files) {
    if (!isAllowedImageFile(file)) {
      errors.push(`"${file.name}" was rejected — only JPG and PNG photos are allowed.`);
    } else {
      formatOk.push(file);
    }
  }

  const incoming = formatOk.reduce((sum, f) => sum + f.size, 0);
  if (formatOk.length && existingBytes + incoming > MAX_TOTAL_IMAGE_BYTES) {
    errors.push(`Photos for one dish can total at most ${formatMb(MAX_TOTAL_IMAGE_BYTES)} — these add ${formatMb(incoming)} to ${formatMb(existingBytes)} already selected. Remove a photo or pick smaller ones.`);
    return { files: [], notices, errors };
  }

  let originalBytes = 0;
  let finalBytes = 0;
  for (const file of formatOk) {
    let loaded;
    try {
      loaded = await loadImage(file);
    } catch (err) {
      errors.push(err.message);
      continue;
    }
    const { img, url } = loaded;
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!matchRatio(w, h, IMAGE_RATIOS)) {
        errors.push(`"${file.name}" is ${describeRatio(w, h)} — rejected. Photos must be ${IMAGE_RATIO_HINT}.`);
        continue;
      }
      const compressed = await compressImage(img, file);
      const finalFile = compressed && compressed.size < file.size ? compressed : file;
      out.push(finalFile);
      originalBytes += file.size;
      finalBytes += finalFile.size;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (out.length && originalBytes > 0) {
    const saved = Math.round((1 - finalBytes / originalBytes) * 100);
    notices.push(`${out.length} photo${out.length === 1 ? '' : 's'} compressed: ${formatMb(originalBytes)} → ${formatMb(finalBytes)} (${saved}% smaller).`);
  }
  return { files: out, notices, errors };
}

/** Reads a video's dimensions. Resolves null if the browser can't decode it. */
export function getVideoDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (val) => { URL.revokeObjectURL(url); resolve(val); };
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

/**
 * Validates picked dish videos: MP4 only, and at most MAX_TOTAL_VIDEO_BYTES
 * per dish together with `existingBytes` already queued. Videos that aren't
 * one of the main ratios are accepted with a notice.
 * Returns { files, notices, errors }.
 */
export async function checkDishVideos(files, { existingBytes = 0 } = {}) {
  const notices = [];
  const errors = [];
  const ok = [];
  for (const file of files) {
    if (!isAllowedVideoFile(file)) {
      errors.push(`"${file.name}" was rejected — only MP4 videos are allowed.`);
    } else {
      ok.push(file);
    }
  }
  const incoming = ok.reduce((sum, f) => sum + f.size, 0);
  if (ok.length && existingBytes + incoming > MAX_TOTAL_VIDEO_BYTES) {
    errors.push(`Videos for one dish can total at most ${formatMb(MAX_TOTAL_VIDEO_BYTES)} — these add ${formatMb(incoming)} to ${formatMb(existingBytes)} already selected.`);
    return { files: [], notices, errors };
  }
  for (const file of ok) {
    const dims = await getVideoDimensions(file);
    if (dims && !matchRatio(dims.width, dims.height, VIDEO_MAIN_RATIOS)) {
      notices.push(`"${file.name}" is ${describeRatio(dims.width, dims.height)} — accepted, but ${VIDEO_RATIO_HINT} fill the video box best.`);
    }
  }
  return { files: ok, notices, errors };
}

function pickMp4RecorderType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

/**
 * Re-encode an MP4 at ~70% of its original bitrate (same resolution and
 * audio) using the browser's MediaRecorder. Runs in real time (a 20 s clip
 * takes ~20 s). If the browser can't record MP4, playback is blocked, or the
 * result isn't meaningfully smaller, the original file is returned unchanged.
 * Resolves { file, compressed, reason? }.
 */
export async function compressDishVideo(file, { onProgress } = {}) {
  const mimeType = pickMp4RecorderType();
  const canCapture = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.prototype.captureStream === 'function';
  if (!mimeType || !canCapture) return { file, compressed: false, reason: 'This browser cannot re-encode MP4 — the original video is kept.' };

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  let audioCtx = null;
  let recorder = null;

  const cleanup = () => {
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    URL.revokeObjectURL(url);
    if (audioCtx) audioCtx.close().catch(() => {});
  };

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('unreadable'));
      setTimeout(() => reject(new Error('timeout')), 10000);
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('unknown duration');

    // Bitrate that lands the file at ~65% of the original (a little under the
    // 70% target to leave room for container overhead).
    const AUDIO_BPS = 96_000;
    const targetTotalBps = (file.size * 8 * (COMPRESSION_TARGET - 0.05)) / duration;
    const videoBitsPerSecond = Math.max(200_000, Math.round(targetTotalBps - AUDIO_BPS));

    // Route audio through Web Audio so it is recorded but not played aloud.
    let audioTracks = [];
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = new Ctx();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        await audioCtx.resume().catch(() => {});
        audioTracks = dest.stream.getAudioTracks();
      }
    } catch (_) { audioTracks = []; }

    await video.play();
    const captured = video.captureStream();
    const tracks = [...captured.getVideoTracks(), ...(audioTracks.length ? audioTracks : captured.getAudioTracks())];
    if (!tracks.some((t) => t.kind === 'video')) throw new Error('no video track');

    const chunks = [];
    recorder = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond, audioBitsPerSecond: AUDIO_BPS });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(1000);

    video.ontimeupdate = () => onProgress?.(Math.min(0.99, video.currentTime / duration));
    await new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error('playback failed'));
      setTimeout(() => reject(new Error('timeout')), duration * 2000 + 15000);
    });
    recorder.stop();
    await stopped;
    onProgress?.(1);

    const blob = new Blob(chunks, { type: 'video/mp4' });
    if (!blob.size || blob.size > file.size * 0.85) {
      return { file, compressed: false, reason: `"${file.name}" is already well compressed — the original is kept.` };
    }
    const base = (file.name || 'dish-video').replace(/\.[^.]+$/, '');
    return { file: new File([blob], `${base}.mp4`, { type: 'video/mp4', lastModified: Date.now() }), compressed: true };
  } catch (err) {
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch (_) {} }
    return { file, compressed: false, reason: `"${file.name}" could not be compressed (${err?.message || 'error'}) — the original is kept.` };
  } finally {
    cleanup();
  }
}
