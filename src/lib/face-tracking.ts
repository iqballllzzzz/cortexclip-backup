/**
 * CortexClip Face Tracking Module
 * Based on OpenShorts' SmoothedCameraman + SpeakerTracker logic.
 * Detects faces using MediaPipe BlazeFace and tracks the active speaker.
 */

export interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export interface FaceTrackingConfig {
  /** Detect every Nth frame */
  detectStride: number;
  /** Jump confirmation frames - how many times a big move must repeat before camera follows */
  jumpConfirmFrames: number;
  /** Reset tracker at scene cuts */
  sceneCutReset: boolean;
  /** Safe zone radius as fraction of crop width */
  safeZoneFraction: number;
  /** Camera pan speed when target is far */
  panSpeedFast: number;
  /** Camera pan speed for close targets */
  panSpeedSlow: number;
}

export const DEFAULT_FACE_TRACKING_CONFIG: FaceTrackingConfig = {
  detectStride: 4,
  jumpConfirmFrames: 3,
  sceneCutReset: true,
  safeZoneFraction: 0.25,
  panSpeedFast: 15,
  panSpeedSlow: 3,
};

export interface CameraState {
  currentCenterX: number;
  targetCenterX: number;
  cropWidth: number;
  cropHeight: number;
  videoWidth: number;
  videoHeight: number;
}

export interface SpeakerState {
  activeSpeakerId: number | null;
  speakerScores: Map<number, number>;
  knownFaces: Array<{ id: number; centerX: number; lastFrame: number }>;
  nextId: number;
  lastSwitchFrame: number;
  switchCooldown: number;
}

/**
 * Initialize camera state for reframing a video.
 */
export function initCamera(
  videoWidth: number,
  videoHeight: number,
  outputWidth: number,
  outputHeight: number
): CameraState {
  const cropHeight = videoHeight;
  const cropWidth = Math.min(
    Math.floor(cropHeight * (9 / 16)),
    videoWidth
  );
  
  return {
    currentCenterX: videoWidth / 2,
    targetCenterX: videoWidth / 2,
    cropWidth,
    cropHeight,
    videoWidth,
    videoHeight,
  };
}

/**
 * Initialize speaker tracking state.
 */
export function initSpeakerTracker(cooldownFrames: number = 30): SpeakerState {
  return {
    activeSpeakerId: null,
    speakerScores: new Map(),
    knownFaces: [],
    nextId: 0,
    lastSwitchFrame: -1000,
    switchCooldown: cooldownFrames,
  };
}

/**
 * Update camera target based on detected face, with jump damping.
 * Returns true if the camera should move.
 */
export function updateCameraTarget(
  camera: CameraState,
  faceCenterX: number,
  config: FaceTrackingConfig,
  forceSnap: boolean = false
): CameraState {
  const safeZone = camera.cropWidth * config.safeZoneFraction;
  
  if (forceSnap) {
    return { ...camera, currentCenterX: faceCenterX, targetCenterX: faceCenterX };
  }
  
  const diff = faceCenterX - camera.targetCenterX;
  
  if (Math.abs(diff) > safeZone) {
    return { ...camera, targetCenterX: faceCenterX };
  }
  
  return camera;
}

/**
 * Move camera towards target with smooth panning.
 */
export function panCamera(
  camera: CameraState,
  config: FaceTrackingConfig
): CameraState {
  const diff = camera.targetCenterX - camera.currentCenterX;
  const safeZone = camera.cropWidth * config.safeZoneFraction;
  
  if (Math.abs(diff) <= safeZone) {
    return camera; // Inside safe zone, no movement
  }
  
  const direction = diff > 0 ? 1 : -1;
  const speed = Math.abs(diff) > camera.cropWidth * 0.5
    ? config.panSpeedFast
    : config.panSpeedSlow;
  
  let newCenter = camera.currentCenterX + direction * speed;
  
  // Clamp
  const halfCrop = camera.cropWidth / 2;
  newCenter = Math.max(halfCrop, Math.min(camera.videoWidth - halfCrop, newCenter));
  
  // Check overshoot
  const newDiff = camera.targetCenterX - newCenter;
  if ((direction === 1 && newDiff < 0) || (direction === -1 && newDiff > 0)) {
    newCenter = camera.targetCenterX;
  }
  
  return { ...camera, currentCenterX: newCenter };
}

/**
 * Get the crop rectangle for the current camera position.
 */
export function getCropBox(camera: CameraState): { x1: number; y1: number; x2: number; y2: number } {
  const halfCrop = camera.cropWidth / 2;
  let x1 = Math.round(camera.currentCenterX - halfCrop);
  let x2 = Math.round(camera.currentCenterX + halfCrop);
  
  x1 = Math.max(0, x1);
  x2 = Math.min(camera.videoWidth, x2);
  
  return { x1, y1: 0, x2, y2: camera.videoHeight };
}

/**
 * Match a face to known speakers by distance.
 */
export function matchFaceToSpeaker(
  face: FaceDetection,
  speaker: SpeakerState,
  frameNumber: number,
  frameWidth: number
): number {
  const centerX = face.x + face.width / 2;
  const minDist = frameWidth * 0.15;
  
  let bestMatchId = -1;
  let bestDist = minDist;
  
  for (const kf of speaker.knownFaces) {
    if (frameNumber - kf.lastFrame > 30) continue;
    const dist = Math.abs(centerX - kf.centerX);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatchId = kf.id;
    }
  }
  
  return bestMatchId;
}

/**
 * Update speaker tracker with new face detections.
 */
export function updateSpeakerTracker(
  speaker: SpeakerState,
  faces: FaceDetection[],
  frameNumber: number,
  frameWidth: number
): SpeakerState {
  const newKnownFaces = [...speaker.knownFaces];
  const newScores = new Map(speaker.speakerScores);
  
  for (const face of faces) {
    let matchId = matchFaceToSpeaker(face, speaker, frameNumber, frameWidth);
    
    if (matchId === -1) {
      matchId = speaker.nextId;
    }
    
    // Update known faces
    const existingIdx = newKnownFaces.findIndex(kf => kf.id === matchId);
    const centerX = face.x + face.width / 2;
    
    if (existingIdx >= 0) {
      newKnownFaces[existingIdx] = { id: matchId, centerX, lastFrame: frameNumber };
    } else {
      newKnownFaces.push({ id: matchId, centerX, lastFrame: frameNumber });
    }
    
    // Update scores
    const rawScore = (face.width * face.height) / (frameWidth * frameWidth * 0.05);
    newScores.set(matchId, (newScores.get(matchId) || 0) + rawScore);
  }
  
  // Decay scores
  for (const [id, score] of newScores) {
    const newScore = score * 0.85;
    if (newScore < 0.1) {
      newScores.delete(id);
    } else {
      newScores.set(id, newScore);
    }
  }
  
  return {
    ...speaker,
    knownFaces: newKnownFaces.filter(kf => frameNumber - kf.lastFrame <= 30),
    speakerScores: newScores,
    nextId: Math.max(speaker.nextId, ...newKnownFaces.map(kf => kf.id)) + 1,
  };
}

/**
 * Determine which speaker to focus on.
 */
export function getBestSpeaker(
  speaker: SpeakerState,
  currentCandidates: Array<{ id: number; centerX: number }>
): number | null {
  if (currentCandidates.length === 0) return speaker.activeSpeakerId;
  
  let bestCandidate: { id: number; centerX: number } | null = null;
  let maxScore = -1;
  
  for (const cand of currentCandidates) {
    let totalScore = speaker.speakerScores.get(cand.id) || 0;
    
    // Hysteresis: sticky factor for current speaker
    if (cand.id === speaker.activeSpeakerId) {
      totalScore *= 3.0;
    }
    
    if (totalScore > maxScore) {
      maxScore = totalScore;
      bestCandidate = cand;
    }
  }
  
  if (bestCandidate) {
    if (bestCandidate.id === speaker.activeSpeakerId) {
      return speaker.activeSpeakerId;
    }
    
    // Check cooldown
    // Caller must track frame number for cooldown
    return bestCandidate.id;
  }
  
  return null;
}
