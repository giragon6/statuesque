/**
 * Pose comparison utility for comparing PoseLandmarker landmarks.
 * Handles partial poses (e.g., top-half vs full-body) and normalizes
 * for scale, translation, and rotation invariance.
 *
 * Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
 */

/**
 * Represents a single pose landmark with normalized coordinates and metadata.
 */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number; // 0-1, confidence that landmark is visible
}

/**
 * MediaPipe Pose Landmark indices for common body parts.
 * Based on MediaPipe's standard 33-landmark pose model.
 */
// @ts-ignore
export enum PoseLandmarkIndex {
  NOSE = 0,
  LEFT_EYE_INNER = 1,
  LEFT_EYE = 2,
  LEFT_EYE_OUTER = 3,
  RIGHT_EYE_INNER = 4,
  RIGHT_EYE = 5,
  RIGHT_EYE_OUTER = 6,
  LEFT_EAR = 7,
  RIGHT_EAR = 8,
  MOUTH_LEFT = 9,
  MOUTH_RIGHT = 10,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_PINKY = 17,
  RIGHT_PINKY = 18,
  LEFT_INDEX = 19,
  RIGHT_INDEX = 20,
  LEFT_THUMB = 21,
  RIGHT_THUMB = 22,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
  LEFT_HEEL = 29,
  RIGHT_HEEL = 30,
  LEFT_FOOT_INDEX = 31,
  RIGHT_FOOT_INDEX = 32
}

/**
 * Configuration for pose comparison.
 */
export interface ComparisonConfig {
  /** Minimum visibility threshold (0-1) for a landmark to be considered */
  visibilityThreshold?: number;
  /** Maximum normalized distance for a match (0-1, typically 0.1-0.3) */
  distanceThreshold?: number;

  similarityThreshold?: number;

  /** Use angle-based features in addition to coordinate distance */
  useAngles?: boolean;
  /** Weight for angle differences when useAngles is true (0-1) */
  angleWeight?: number;
  /** Normalize by limb length instead of overall torso length (better for different body proportions) */
  perLimbNormalization?: boolean;
  /** Use only angle comparison, ignoring position/scale entirely (most forgiving of body differences) */
  angleOnly?: boolean;
}

/**
 * Result of a pose comparison.
 */
export interface ComparisonResult {
  /** Whether the poses match (above threshold) */
  isMatching: boolean;
  /** Similarity score (0-1, where 1 is perfect match) */
  similarity: number;
  /** Number of landmarks compared */
  landmarksCompared: number;
  /** Number of landmarks that were visible in both poses */
  validLandmarks: number;
  /** Mean distance between matched landmarks */
  meanDistance: number;
  /** Which body regions were compared (for debugging partial poses) */
  comparedRegions: BodyRegion[];
  /** Breakdown of distances per region */
  regionDistances?: Record<BodyRegion, number>;
}

/**
 * Body regions for tracking which parts of the pose were compared.
 */
export type BodyRegion = "upper" | "lower" | "left_arm" | "right_arm";

/**
 * Normalized feature vector for a pose.
 */
interface NormalizedPose {
  landmarks: Landmark[];
  origin: Landmark;
  scale: number;
  visibleLandmarkIndices: number[];
}

/**
 * Default configuration for pose comparison.
 */
const DEFAULT_CONFIG: Required<ComparisonConfig> = {
  visibilityThreshold: 0.5,
  distanceThreshold: 0.5,
  similarityThreshold: 0.5,
  useAngles: false,
  angleWeight: 0.3,
  perLimbNormalization: false,
  angleOnly: false
};

/**
 * Compute Euclidean distance between two landmarks.
 */
function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute midpoint between two landmarks.
 */
function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z !== undefined && b.z !== undefined ? (a.z + b.z) / 2 : undefined
  };
}

/**
 * Normalize landmarks by individual limb lengths.
 * Each limb (arm, leg, torso) is normalized by its own length,
 * making the comparison robust to different body proportions.
 * E.g., narrower shoulders won't penalize the match if angles are correct.
 */
function normalizeLandmarksByLimbs(landmarks: Landmark[]): Landmark[] {
  // Define limb pairs: (start_idx, end_idx, name)
  const limbs: Array<[number, number, string]> = [
    [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_ELBOW, "left_upper_arm"],
    [PoseLandmarkIndex.LEFT_ELBOW, PoseLandmarkIndex.LEFT_WRIST, "left_forearm"],
    [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_ELBOW, "right_upper_arm"],
    [PoseLandmarkIndex.RIGHT_ELBOW, PoseLandmarkIndex.RIGHT_WRIST, "right_forearm"],
    [PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.LEFT_KNEE, "left_thigh"],
    [PoseLandmarkIndex.LEFT_KNEE, PoseLandmarkIndex.LEFT_ANKLE, "left_calf"],
    [PoseLandmarkIndex.RIGHT_HIP, PoseLandmarkIndex.RIGHT_KNEE, "right_thigh"],
    [PoseLandmarkIndex.RIGHT_KNEE, PoseLandmarkIndex.RIGHT_ANKLE, "right_calf"],
    [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_HIP, "left_torso"],
    [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_HIP, "right_torso"]
  ];

  // Compute limb lengths
  const limbLengths = new Map<number, number>();
  for (const [startIdx, endIdx] of limbs) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];
    if (start && end) {
      const len = distance(start, end);
      limbLengths.set(startIdx, Math.max(len, 0.01));
    }
  }

  // Normalize each landmark by its associated limb length
  return landmarks.map((lm, idx) => {
    const limbLength = limbLengths.get(idx) || 1;
    return {
      x: lm.x / limbLength,
      y: lm.y / limbLength,
      z: lm.z !== undefined ? lm.z / limbLength : undefined,
      visibility: lm.visibility
    };
  });
}

/**
 * Compute the angle at point B formed by vectors BA and BC (in degrees).
 * Returns angle in range [0, 180].
 */
export function computeAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = dot / (mag1 * mag2);
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
  return Math.acos(clampedCosAngle) * (180 / Math.PI);
}

/**
 * Detect which body regions are visible in the landmark set.
 */
function detectVisibleRegions(landmarks: Landmark[], config: Required<ComparisonConfig>): BodyRegion[] {
  const regions: BodyRegion[] = [];
  const isVisible = (idx: number) =>
    idx < landmarks.length && (landmarks[idx].visibility ?? 1) >= config.visibilityThreshold;

  // Upper body: shoulders and above
  if (isVisible(PoseLandmarkIndex.LEFT_SHOULDER) || isVisible(PoseLandmarkIndex.RIGHT_SHOULDER)) {
    regions.push("upper");
  }

  // Lower body: hips and below
  if (isVisible(PoseLandmarkIndex.LEFT_HIP) || isVisible(PoseLandmarkIndex.RIGHT_HIP)) {
    regions.push("lower");
  }

  // Left arm
  if (
    isVisible(PoseLandmarkIndex.LEFT_SHOULDER) &&
    (isVisible(PoseLandmarkIndex.LEFT_ELBOW) || isVisible(PoseLandmarkIndex.LEFT_WRIST))
  ) {
    regions.push("left_arm");
  }

  // Right arm
  if (
    isVisible(PoseLandmarkIndex.RIGHT_SHOULDER) &&
    (isVisible(PoseLandmarkIndex.RIGHT_ELBOW) || isVisible(PoseLandmarkIndex.RIGHT_WRIST))
  ) {
    regions.push("right_arm");
  }

  return regions;
}

/**
 * Filter landmarks to only those that are sufficiently visible.
 * Returns indices of visible landmarks.
 */
function filterVisibleLandmarks(
  landmarks: Landmark[],
  config: Required<ComparisonConfig>
): number[] {
  return landmarks
    .map((lm, idx) => ({ lm, idx }))
    .filter(({ lm }) => (lm.visibility ?? 1) >= config.visibilityThreshold)
    .map(({ idx }) => idx);
}

/**
 * Normalize a pose by translating to origin and scaling by torso/shoulder length.
 * Optionally apply per-limb normalization for robustness to body proportion differences.
 * Ensures invariance to position and scale differences.
 */
function normalizePose(landmarks: Landmark[], config: Required<ComparisonConfig>): NormalizedPose {
  const visibleIndices = filterVisibleLandmarks(landmarks, config);

  if (visibleIndices.length === 0) {
    throw new Error("No visible landmarks to normalize");
  }

  // Apply per-limb normalization first if requested
  let landmarksToNormalize = landmarks;
  if (config.perLimbNormalization) {
    landmarksToNormalize = normalizeLandmarksByLimbs(landmarks);
  }

  // Compute origin: use hip center if available, else shoulder center, else nose
  let origin: Landmark;
  const leftHip = landmarksToNormalize[PoseLandmarkIndex.LEFT_HIP];
  const rightHip = landmarksToNormalize[PoseLandmarkIndex.RIGHT_HIP];
  const leftShoulder = landmarksToNormalize[PoseLandmarkIndex.LEFT_SHOULDER];
  const rightShoulder = landmarksToNormalize[PoseLandmarkIndex.RIGHT_SHOULDER];
  const nose = landmarksToNormalize[PoseLandmarkIndex.NOSE];

  if (leftHip && rightHip && (leftHip.visibility ?? 1) > 0.3 && (rightHip.visibility ?? 1) > 0.3) {
    origin = midpoint(leftHip, rightHip);
  } else if (
    leftShoulder &&
    rightShoulder &&
    (leftShoulder.visibility ?? 1) > 0.3 &&
    (rightShoulder.visibility ?? 1) > 0.3
  ) {
    origin = midpoint(leftShoulder, rightShoulder);
  } else if (nose && (nose.visibility ?? 1) > 0.3) {
    origin = nose;
  } else {
    // Fallback: average all visible landmarks
    const visibleLms = visibleIndices.map(i => landmarksToNormalize[i]);
    const avgX = visibleLms.reduce((sum, lm) => sum + lm.x, 0) / visibleLms.length;
    const avgY = visibleLms.reduce((sum, lm) => sum + lm.y, 0) / visibleLms.length;
    origin = { x: avgX, y: avgY };
  }

  // Compute scale: use torso length (shoulder to hip) or shoulder width
  let scale = 1;
  if (
    leftShoulder &&
    rightShoulder &&
    leftHip &&
    rightHip &&
    (leftShoulder.visibility ?? 1) > 0.3 &&
    (rightShoulder.visibility ?? 1) > 0.3 &&
    (leftHip.visibility ?? 1) > 0.3 &&
    (rightHip.visibility ?? 1) > 0.3
  ) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    scale = Math.max(distance(shoulderCenter, hipCenter), 0.01);
  } else if (
    leftShoulder &&
    rightShoulder &&
    (leftShoulder.visibility ?? 1) > 0.3 &&
    (rightShoulder.visibility ?? 1) > 0.3
  ) {
    scale = Math.max(distance(leftShoulder, rightShoulder), 0.01);
  } else {
    // Fallback: use largest distance between any two visible landmarks
    let maxDist = 0.01;
    for (let i = 0; i < visibleIndices.length; i++) {
      for (let j = i + 1; j < visibleIndices.length; j++) {
        const d = distance(landmarksToNormalize[visibleIndices[i]], landmarksToNormalize[visibleIndices[j]]);
        maxDist = Math.max(maxDist, d);
      }
    }
    scale = maxDist;
  }

  // Normalize: translate by origin, then scale
  const normalized: Landmark[] = landmarksToNormalize.map(lm => ({
    x: (lm.x - origin.x) / scale,
    y: (lm.y - origin.y) / scale,
    z: lm.z !== undefined ? lm.z / scale : undefined,
    visibility: lm.visibility
  }));

  return {
    landmarks: normalized,
    origin,
    scale,
    visibleLandmarkIndices: visibleIndices
  };
}

/**
 * Compute distance-based features for comparison.
 */
function computeDistanceFeatures(
  targetPose: NormalizedPose,
  currentPose: NormalizedPose
): { distances: number[]; validCount: number } {
  const commonIndices = targetPose.visibleLandmarkIndices.filter(idx =>
    currentPose.visibleLandmarkIndices.includes(idx)
  );

  const distances: number[] = [];
  for (const idx of commonIndices) {
    const d = distance(targetPose.landmarks[idx], currentPose.landmarks[idx]);
    distances.push(d);
  }

  return {
    distances,
    validCount: commonIndices.length
  };
}

/**
 * Compute angle-based features for comparison (joint angles).
 * Key joint triples: (parent, joint, child)
 */
function computeAngleFeatures(
  targetPose: NormalizedPose,
  currentPose: NormalizedPose
): { angles: number[]; validCount: number } {
  const jointTriples: Array<[number, number, number]> = [
    [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_ELBOW, PoseLandmarkIndex.LEFT_WRIST],
    [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_ELBOW, PoseLandmarkIndex.RIGHT_WRIST],
    [PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.LEFT_KNEE, PoseLandmarkIndex.LEFT_ANKLE],
    [PoseLandmarkIndex.RIGHT_HIP, PoseLandmarkIndex.RIGHT_KNEE, PoseLandmarkIndex.RIGHT_ANKLE],
    [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.LEFT_KNEE],
    [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_HIP, PoseLandmarkIndex.RIGHT_KNEE]
  ];

  const angles: number[] = [];

  for (const [a, b, c] of jointTriples) {
    const targetVisible =
      targetPose.visibleLandmarkIndices.includes(a) &&
      targetPose.visibleLandmarkIndices.includes(b) &&
      targetPose.visibleLandmarkIndices.includes(c);

    const currentVisible =
      currentPose.visibleLandmarkIndices.includes(a) &&
      currentPose.visibleLandmarkIndices.includes(b) &&
      currentPose.visibleLandmarkIndices.includes(c);

    if (targetVisible && currentVisible) {
      const targetAngle = computeAngle(
        targetPose.landmarks[a],
        targetPose.landmarks[b],
        targetPose.landmarks[c]
      );
      const currentAngle = computeAngle(
        currentPose.landmarks[a],
        currentPose.landmarks[b],
        currentPose.landmarks[c]
      );
      const angleDiff = Math.abs(targetAngle - currentAngle);
      angles.push(Math.min(angleDiff, 180 - angleDiff) / 180); // Normalize to [0, 1]
    }
  }

  return {
    angles,
    validCount: angles.length
  };
}

/**
 * Compare poses using only joint angles (ignores position, scale, and body proportions).
 * Most forgiving approach - only cares about limb orientations.
 */
function compareAnglesOnly(
  targetLandmarks: Landmark[],
  currentLandmarks: Landmark[],
  config: Required<ComparisonConfig>
): ComparisonResult {
  try {
    const targetPose = normalizePose(targetLandmarks, config);
    const currentPose = normalizePose(currentLandmarks, config);

    const angleFeatures = computeAngleFeatures(targetPose, currentPose);

    if (angleFeatures.validCount === 0) {
      return {
        isMatching: false,
        similarity: 0,
        landmarksCompared: 0,
        validLandmarks: 0,
        meanDistance: 1,
        comparedRegions: []
      };
    }

    const meanAngleDiff =
      angleFeatures.angles.reduce((a, b) => a + b, 0) / angleFeatures.angles.length;
    const similarity = 1 - meanAngleDiff;

    const targetRegions = detectVisibleRegions(targetPose.landmarks, config);
    const currentRegions = detectVisibleRegions(currentPose.landmarks, config);
    const comparedRegions = targetRegions.filter(r => currentRegions.includes(r)) as BodyRegion[];

    return {
      isMatching: similarity >= config.similarityThreshold,
      similarity: Math.max(0, Math.min(1, similarity)),
      landmarksCompared: angleFeatures.validCount,
      validLandmarks: angleFeatures.validCount,
      meanDistance: meanAngleDiff,
      comparedRegions
    };
  } catch (error) {
    console.error("Error comparing angles:", error);
    return {
      isMatching: false,
      similarity: 0,
      landmarksCompared: 0,
      validLandmarks: 0,
      meanDistance: 1,
      comparedRegions: []
    };
  }
}

/**
 * Compare two poses and return a similarity score.
 *
 * @param targetLandmarks - Reference pose landmarks (from image)
 * @param currentLandmarks - Current pose landmarks (from webcam)
 * @param config - Comparison configuration
 * @returns ComparisonResult with similarity score and metadata
 *
 * @example
 * // Standard comparison
 * const result = comparePoses(imageLandmarks, webcamLandmarks);
 *
 * // Angle-only (most forgiving of body differences)
 * const result = comparePoses(imageLandmarks, webcamLandmarks, { angleOnly: true });
 *
 * // Per-limb normalization (good for different proportions)
 * const result = comparePoses(imageLandmarks, webcamLandmarks, { perLimbNormalization: true });
 */
export function comparePoses(
  targetLandmarks: Landmark[],
  currentLandmarks: Landmark[],
  config?: ComparisonConfig
): ComparisonResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Validate inputs
  if (targetLandmarks.length === 0 || currentLandmarks.length === 0) {
    throw new Error("Landmark arrays cannot be empty");
  }

  try {
    // If angleOnly mode, skip position/scale comparison entirely
    if (finalConfig.angleOnly) {
      return compareAnglesOnly(targetLandmarks, currentLandmarks, finalConfig);
    }

    // Normalize both poses
    const targetPose = normalizePose(targetLandmarks, finalConfig);
    const currentPose = normalizePose(currentLandmarks, finalConfig);

    // Compute features
    const distFeatures = computeDistanceFeatures(targetPose, currentPose);

    if (distFeatures.validCount === 0) {
      return {
        isMatching: false,
        similarity: 0,
        landmarksCompared: 0,
        validLandmarks: 0,
        meanDistance: 1,
        comparedRegions: []
      };
    }

    // Compute mean distance
    const meanDistance = distFeatures.distances.reduce((a, b) => a + b, 0) / distFeatures.distances.length;

    // Optionally incorporate angle features
    let similarity = Math.max(0, 1 - meanDistance);

    if (finalConfig.useAngles) {
      const angleFeatures = computeAngleFeatures(targetPose, currentPose);
      if (angleFeatures.validCount > 0) {
        const meanAngleDiff =
          angleFeatures.angles.reduce((a, b) => a + b, 0) / angleFeatures.angles.length;
        const angleSimilarity = 1 - meanAngleDiff;
        similarity =
          similarity * (1 - finalConfig.angleWeight) +
          angleSimilarity * finalConfig.angleWeight;
      }
    }

    // Detect compared regions for debugging
    const targetRegions = detectVisibleRegions(targetPose.landmarks, finalConfig);
    const currentRegions = detectVisibleRegions(currentPose.landmarks, finalConfig);
    const comparedRegions = targetRegions.filter(r => currentRegions.includes(r)) as BodyRegion[];

    // Compute region distances for debugging
    // @ts-ignore
    const regionDistances: Record<BodyRegion, number> = {};

    const regionIndices: Record<BodyRegion, number[]> = {
      upper: [
        PoseLandmarkIndex.LEFT_SHOULDER,
        PoseLandmarkIndex.RIGHT_SHOULDER,
        PoseLandmarkIndex.LEFT_ELBOW,
        PoseLandmarkIndex.RIGHT_ELBOW
      ],
      lower: [
        PoseLandmarkIndex.LEFT_HIP,
        PoseLandmarkIndex.RIGHT_HIP,
        PoseLandmarkIndex.LEFT_KNEE,
        PoseLandmarkIndex.RIGHT_KNEE,
        PoseLandmarkIndex.LEFT_ANKLE,
        PoseLandmarkIndex.RIGHT_ANKLE
      ],
      left_arm: [
        PoseLandmarkIndex.LEFT_SHOULDER,
        PoseLandmarkIndex.LEFT_ELBOW,
        PoseLandmarkIndex.LEFT_WRIST
      ],
      right_arm: [
        PoseLandmarkIndex.RIGHT_SHOULDER,
        PoseLandmarkIndex.RIGHT_ELBOW,
        PoseLandmarkIndex.RIGHT_WRIST
      ]
    };

    for (const region of comparedRegions) {
      const indices = regionIndices[region];
      const regionDistances_vals: number[] = [];

      for (const idx of indices) {
        if (
          targetPose.visibleLandmarkIndices.includes(idx) &&
          currentPose.visibleLandmarkIndices.includes(idx)
        ) {
          const d = distance(targetPose.landmarks[idx], currentPose.landmarks[idx]);
          regionDistances_vals.push(d);
        }
      }

      if (regionDistances_vals.length > 0) {
        regionDistances[region] =
          regionDistances_vals.reduce((a, b) => a + b, 0) / regionDistances_vals.length;
      }
    }

    return {
      isMatching: similarity >= finalConfig.similarityThreshold,
      similarity: Math.max(0, Math.min(1, similarity)),
      landmarksCompared: targetPose.visibleLandmarkIndices.length,
      validLandmarks: distFeatures.validCount,
      meanDistance,
      comparedRegions,
      regionDistances
    };
  } catch (error) {
    console.error("Error comparing poses:", error);
    return {
      isMatching: false,
      similarity: 0,
      landmarksCompared: 0,
      validLandmarks: 0,
      meanDistance: 1,
      comparedRegions: []
    };
  }
}

/**
 * Utility function to convert MediaPipe PoseLandmarkerResult landmarks to Landmark format.
 *
 * @param mediapipeResult - Result from PoseLandmarker.detectForVideo or detect
 * @param poseIndex - Which pose to extract (default 0, the first detected pose)
 * @returns Landmark array
 */
export function extractLandmarksFromResult(
  mediapipeResult: any,
  poseIndex: number = 0
): Landmark[] {
  // MediaPipe returns either 'landmarks' (normalized) or 'worldLandmarks' (3D world coords)
  const landmarkList = mediapipeResult.landmarks?.[poseIndex] || mediapipeResult.worldLandmarks?.[poseIndex] || [];

  return landmarkList.map((lm: any) => ({
    x: lm.x ?? 0,
    y: lm.y ?? 0,
    z: lm.z,
    visibility: lm.visibility
  }));
}
