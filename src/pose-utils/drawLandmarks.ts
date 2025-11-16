/**
 * Utility to draw pose landmarks on a canvas.
 * Provides functions to visualize landmarks with connections.
 */

import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./comparePoses";

/**
 * Configuration for drawing landmarks.
 */
export interface DrawLandmarksConfig {
  landmarkRadius?: number;
  landmarkColor?: string;
  connectionColor?: string;
  connectionWidth?: number;
}

const DEFAULT_CONFIG: Required<DrawLandmarksConfig> = {
  landmarkRadius: 4,
  landmarkColor: "#00FF00",
  connectionColor: "#00FF00",
  connectionWidth: 2
};

/**
 * Draw landmarks and connections on a canvas context.
 *
 * @param ctx - Canvas 2D context
 * @param landmarks - Array of landmarks to draw
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param config - Drawing configuration
 */
export function drawLandmarksOnContext(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  canvasWidth: number,
  canvasHeight: number,
  config?: DrawLandmarksConfig
): void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Draw connections (pose skeleton)
  const connections = PoseLandmarker.POSE_CONNECTIONS;
  ctx.strokeStyle = finalConfig.connectionColor;
  ctx.lineWidth = finalConfig.connectionWidth;

  for (const connection of connections) {
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];

    if (!start || !end) continue;

    const startX = start.x * canvasWidth;
    const startY = start.y * canvasHeight;
    const endX = end.x * canvasWidth;
    const endY = end.y * canvasHeight;

    // Skip if visibility too low
    if ((start.visibility ?? 1) < 0.3 || (end.visibility ?? 1) < 0.3) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Draw landmarks (joints)
  ctx.fillStyle = finalConfig.landmarkColor;
  for (const landmark of landmarks) {
    if ((landmark.visibility ?? 1) < 0.3) continue;

    const x = landmark.x * canvasWidth;
    const y = landmark.y * canvasHeight;

    ctx.beginPath();
    ctx.arc(x, y, finalConfig.landmarkRadius, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw landmarks on a canvas element from an image and landmarks array.
 * Useful for displaying reference poses.
 *
 * @param canvas - Canvas element to draw on
 * @param imageUrl - URL of the reference image
 * @param landmarks - Landmarks to draw
 * @param config - Drawing configuration
 */
export async function drawPoseImageWithLandmarks(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  landmarks: Landmark[],
  config?: DrawLandmarksConfig
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  // Load image
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });

  // Set canvas size to match image
  canvas.width = img.width;
  canvas.height = img.height;

  // Draw image
  ctx.drawImage(img, 0, 0);

  // Draw landmarks
  drawLandmarksOnContext(ctx, landmarks, img.width, img.height, config);
}

/**
 * Draw landmarks on canvas from normalized coordinates (0-1 range).
 * This is the standard format from MediaPipe.
 *
 * @param canvas - Canvas element
 * @param landmarks - Normalized landmarks
 * @param backgroundColor - Optional background color
 * @param config - Drawing configuration
 */
export function drawNormalizedLandmarks(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  config?: DrawLandmarksConfig
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  // Draw landmarks
  drawLandmarksOnContext(ctx, landmarks, canvas.width, canvas.height, config);
}
