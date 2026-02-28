/**
 * Browser-side face + metrics pipeline using MediaPipe Face Landmarker.
 * Produces emotion_data payload compatible with reference (SENSEI) format.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const EMOTION_KEYS = [
  'anger',
  'disgust',
  'fear',
  'happiness',
  'sadness',
  'surprise',
  'neutral',
];

/**
 * Map MediaPipe blendshape category names to our emotion keys.
 * MediaPipe face_landmarker uses ARKit-style blend names.
 */
function blendshapesToEmotions(faceBlendshapes) {
  const out = {
    anger: 0,
    disgust: 0,
    fear: 0,
    happiness: 0,
    sadness: 0,
    surprise: 0,
    neutral: 0,
  };
  if (!faceBlendshapes?.length || !faceBlendshapes[0]?.categories) return out;
  const cats = faceBlendshapes[0].categories;
  for (const c of cats) {
    const name = (c.categoryName || '').toLowerCase();
    const score = Math.max(0, Math.min(1, c.score ?? 0)) * 100;
    if (name.includes('mouth') && name.includes('smile')) out.happiness += score;
    else if (name.includes('mouth') && name.includes('frown')) out.sadness += score;
    else if (name.includes('brow') && name.includes('down')) out.anger += score * 0.8;
    else if (name.includes('eye') && name.includes('wide')) out.surprise += score * 0.8;
    else if (name.includes('nose') && name.includes('sneer')) out.disgust += score;
    else if (name.includes('mouth') && name.includes('pucker')) out.neutral += score * 0.5;
    else if (name.includes('eye') && name.includes('blink')) out.neutral += score * 0.3;
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const k of Object.keys(out)) {
      out[k] = Math.round((out[k] / total) * 100);
    }
  } else {
    out.neutral = 100;
  }
  return out;
}

function dominantEmotion(emotions) {
  let max = 0;
  let name = 'neutral';
  for (const [k, v] of Object.entries(emotions)) {
    if (v > max) {
      max = v;
      name = k;
    }
  }
  return name;
}

function calculateEngagement(emotions) {
  const n = { ...emotions };
  const total = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(n)) n[k] = n[k] / total;
  const engagement =
    (n.happiness ?? 0) * 3.5 +
    (n.surprise ?? 0) * 3.0 +
    (n.anger ?? 0) * 2.0 +
    (n.fear ?? 0) * 1.5 -
    (n.neutral ?? 0) * 0.5 -
    (n.sadness ?? 0) * 1.0 -
    (n.disgust ?? 0) * 1.5;
  const base = 60;
  const scale = (100 - base) / 3.5;
  return Math.max(20, Math.min(100, Math.round(base + engagement * scale)));
}

function calculateConcentration(emotions) {
  const n = { ...emotions };
  const total = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(n)) n[k] = n[k] / total;
  let concentration =
    (n.neutral ?? 0) * 3.0 +
    (n.sadness ?? 0) * 0.5 -
    (n.happiness ?? 0) * 0.8 -
    (n.anger ?? 0) * 1.5 -
    (n.fear ?? 0) * 2.0 -
    (n.surprise ?? 0) * 2.5;
  const nonZero = Object.values(n).filter((v) => v > 0.1).length;
  const variability = nonZero <= 1 ? 1 : 1 / nonZero;
  const base = 50;
  const scale = (100 - base) / 3.0;
  concentration = base + concentration * scale * variability;
  return Math.max(0, Math.min(100, Math.round(concentration)));
}

function calculateConfusion(emotions) {
  const n = { ...emotions };
  const total = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(n)) n[k] = n[k] / total;
  let confusion =
    (n.fear ?? 0) * 2.5 +
    (n.surprise ?? 0) * 2.0 +
    (n.disgust ?? 0) * 1.5 +
    (n.anger ?? 0) * 1.0 +
    (n.sadness ?? 0) * 0.5 -
    (n.neutral ?? 0) * 1.5 -
    (n.happiness ?? 0) * 2.0;
  const above = Object.values(n).filter((v) => v > 0.15).length;
  const diversity = Math.min(1.5, 0.5 + above * 0.25);
  const base = 30;
  const scale = (100 - base) / 3.0;
  confusion = base + confusion * scale * diversity;
  return Math.max(0, Math.min(100, Math.round(confusion)));
}

// MediaPipe Face Mesh indices (same as Face Landmarker 478-point model)
const LEFT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const RIGHT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const LEFT_IRIS = [474, 475, 476, 477];
const RIGHT_IRIS = [469, 470, 471, 472];

const GAZE_HISTORY_LENGTH = 15;
const DISTRACTION_THRESHOLD = 0.4;
const gazeMagnitudeHistory = [];

function getPoint(pts, i) {
  const p = pts[i];
  return p ? { x: p.x ?? 0, y: p.y ?? 0 } : null;
}

function centroid(pts, indices) {
  let sumX = 0, sumY = 0, n = 0;
  for (const i of indices) {
    const p = getPoint(pts, i);
    if (p) { sumX += p.x; sumY += p.y; n++; }
  }
  return n === 0 ? null : { x: sumX / n, y: sumY / n };
}

function eyeSize(pts, indices) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const i of indices) {
    const p = getPoint(pts, i);
    if (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return Math.max(0.001, w + h);
}

/**
 * Iris-based gaze: displacement of iris center from eye center, normalized by eye size.
 * Returns gaze magnitude (0 = looking straight, higher = looking away). Null if iris unavailable.
 */
function computeGazeMagnitude(pts) {
  if (!pts || pts.length < 478) return null;
  const leftEyeCenter = centroid(pts, LEFT_EYE_CONTOUR);
  const rightEyeCenter = centroid(pts, RIGHT_EYE_CONTOUR);
  const leftIrisCenter = centroid(pts, LEFT_IRIS);
  const rightIrisCenter = centroid(pts, RIGHT_IRIS);
  if (!leftEyeCenter || !rightEyeCenter || !leftIrisCenter || !rightIrisCenter) return null;

  const leftVec = { x: leftIrisCenter.x - leftEyeCenter.x, y: leftIrisCenter.y - leftEyeCenter.y };
  const rightVec = { x: rightIrisCenter.x - rightEyeCenter.x, y: rightIrisCenter.y - rightEyeCenter.y };

  const leftSize = eyeSize(pts, LEFT_EYE_CONTOUR);
  const rightSize = eyeSize(pts, RIGHT_EYE_CONTOUR);
  const leftNorm = { x: leftVec.x / leftSize, y: leftVec.y / leftSize };
  const rightNorm = { x: rightVec.x / rightSize, y: rightVec.y / rightSize };

  const gazeX = (leftNorm.x + rightNorm.x) / 2;
  const gazeY = (leftNorm.y + rightNorm.y) / 2;
  return Math.hypot(gazeX, gazeY);
}

/** Temporal smoothing: average of last GAZE_HISTORY_LENGTH magnitudes. */
function smoothGazeMagnitude(magnitude) {
  if (magnitude == null || !Number.isFinite(magnitude)) return null;
  gazeMagnitudeHistory.push(magnitude);
  if (gazeMagnitudeHistory.length > GAZE_HISTORY_LENGTH) gazeMagnitudeHistory.shift();
  const sum = gazeMagnitudeHistory.reduce((a, b) => a + b, 0);
  return sum / gazeMagnitudeHistory.length;
}

/**
 * Map smoothed gaze magnitude to distraction (0–100) then focus = 100 - distraction.
 * Piecewise: norm < 0.3 → distraction 0–10%; 0.3–0.7 → 30–70%; > 0.7 → 70–100%.
 */
function magnitudeToFocusDistraction(avgMagnitude) {
  if (avgMagnitude == null || !Number.isFinite(avgMagnitude)) return { focus: 50, distraction: 50 };
  const normalized = Math.min(1.0, avgMagnitude / DISTRACTION_THRESHOLD);
  let distraction;
  if (normalized < 0.3) {
    distraction = 10 * (normalized / 0.3);
  } else if (normalized <= 0.7) {
    distraction = 10 + (60 * (normalized - 0.3)) / 0.4;
  } else {
    distraction = 70 + (30 * (normalized - 0.7)) / 0.3;
  }
  distraction = Math.max(0, Math.min(100, distraction));
  const focus = Math.max(0, Math.min(100, 100 - distraction));
  return { focus: Math.round(focus), distraction: Math.round(distraction) };
}

/** Eye openness from upper/lower lid distance (right: 159,145; left: 386,374) and eye width. */
function eyeOpennessFromLandmarks(faceLandmarks) {
  if (!faceLandmarks?.length) return null;
  const pts = faceLandmarks[0];
  if (!pts || pts.length < 400) return null;
  const dist = (a, b) =>
    Math.hypot(
      (pts[a].x ?? 0) - (pts[b].x ?? 0),
      (pts[a].y ?? 0) - (pts[b].y ?? 0)
    );
  const rightOpen = dist(159, 145);
  const rightW = Math.max(0.001, dist(33, 133));
  const leftOpen = dist(386, 374);
  const leftW = Math.max(0.001, dist(362, 263));
  return (rightOpen / rightW + leftOpen / leftW) / 2;
}

/**
 * Focus and distraction from iris-based gaze: eye/iris centers → displacement → normalize → smooth → map.
 * Falls back to nose-based heuristic if iris landmarks are not available (e.g. model without iris).
 */
function focusFromLandmarks(faceLandmarks) {
  if (!faceLandmarks?.length) return 50;
  const pts = faceLandmarks[0];
  if (!pts?.length) return 50;

  const magnitude = computeGazeMagnitude(pts);
  if (magnitude != null) {
    const smoothed = smoothGazeMagnitude(magnitude);
    const { focus } = magnitudeToFocusDistraction(smoothed);
    return focus;
  }

  const nose = pts[1] || pts[0];
  const dx = (nose.x ?? 0.5) - 0.5;
  const dy = (nose.y ?? 0.5) - 0.5;
  const off = Math.min(1, Math.hypot(dx, dy) * 2);
  return Math.round(100 - off * 100);
}

/** Returns { focus, distraction } for a single face; uses iris-based gaze when available. */
function focusAndDistractionFromLandmarks(faceLandmarks) {
  if (!faceLandmarks?.length) return { focus: 50, distraction: 50 };
  const pts = faceLandmarks[0];
  if (!pts?.length) return { focus: 50, distraction: 50 };

  const magnitude = computeGazeMagnitude(pts);
  if (magnitude != null) {
    const smoothed = smoothGazeMagnitude(magnitude);
    return magnitudeToFocusDistraction(smoothed);
  }

  const nose = pts[1] || pts[0];
  const dx = (nose.x ?? 0.5) - 0.5;
  const dy = (nose.y ?? 0.5) - 0.5;
  const off = Math.min(1, Math.hypot(dx, dy) * 2);
  const focus = Math.round(100 - off * 100);
  return { focus, distraction: Math.max(0, 100 - focus) };
}

/**
 * Build one emotion_data item from FaceLandmarker result (one face).
 */
export function resultToEmotionData(result, timestampIso) {
  if (!result?.faceLandmarks?.length) {
    return [
      {
        timestamp: timestampIso,
        face_id: -1,
        dominant_emotion: 'none',
        engagement: 0,
        concentration: 0,
        confusion: 0,
        focus: 0,
        distraction: 0,
        anger: 0,
        disgust: 0,
        fear: 0,
        happiness: 0,
        sadness: 0,
        surprise: 0,
        neutral: 100,
      },
    ];
  }
  const emotions = result.faceBlendshapes?.length
    ? blendshapesToEmotions(result.faceBlendshapes)
    : { anger: 0, disgust: 0, fear: 0, happiness: 0, sadness: 0, surprise: 0, neutral: 100 };
  const engagement = calculateEngagement(emotions);
  const concentration = calculateConcentration(emotions);
  const confusion = calculateConfusion(emotions);
  const { focus, distraction } = focusAndDistractionFromLandmarks(result.faceLandmarks);
  const fusedEngagement = Math.round(0.6 * engagement + 0.4 * focus);
  const clamped = (v) => Math.max(0, Math.min(100, Math.round(v)));

  const data = [];
  for (let i = 0; i < result.faceLandmarks.length; i++) {
    const lm = result.faceLandmarks[i];
    if (!lm?.length) continue;
    const { focus: faceFocus, distraction: faceDistraction } = focusAndDistractionFromLandmarks([lm]);
    const faceEmotions =
      result.faceBlendshapes?.[i]?.categories != null
        ? blendshapesToEmotions([result.faceBlendshapes[i]])
        : emotions;
    data.push({
      timestamp: timestampIso,
      face_id: i,
      dominant_emotion: dominantEmotion(faceEmotions),
      engagement: result.faceLandmarks.length === 1 ? fusedEngagement : calculateEngagement(faceEmotions),
      concentration: concentration,
      confusion: confusion,
      focus: faceFocus,
      distraction: faceDistraction,
      anger: clamped(faceEmotions.anger ?? 0),
      disgust: clamped(faceEmotions.disgust ?? 0),
      fear: clamped(faceEmotions.fear ?? 0),
      happiness: clamped(faceEmotions.happiness ?? 0),
      sadness: clamped(faceEmotions.sadness ?? 0),
      surprise: clamped(faceEmotions.surprise ?? 0),
      neutral: clamped(faceEmotions.neutral ?? 0),
    });
  }
  if (data.length === 0) {
    data.push({
      timestamp: timestampIso,
      face_id: -1,
      dominant_emotion: 'none',
      engagement: 0,
      concentration: 0,
      confusion: 0,
      focus: 0,
      distraction: 0,
      anger: 0,
      disgust: 0,
      fear: 0,
      happiness: 0,
      sadness: 0,
      surprise: 0,
      neutral: 100,
    });
  }
  return data;
}

let landmarkerInstance = null;

export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.4,
    minFacePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  return landmarkerInstance;
}

/**
 * Detect on a video frame. Call with video element and timestamp in ms.
 */
export async function detectFace(video, timestampMs) {
  const landmarker = await getFaceLandmarker();
  if (!video || video.readyState < 2) return null;
  return landmarker.detectForVideo(video, timestampMs);
}
