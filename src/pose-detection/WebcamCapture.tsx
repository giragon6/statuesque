/**
 * WebcamCapture component captures user webcam feed with pose landmarks overlay.
 * Exposes a method to retrieve current landmarks via useImperativeHandle.
 *
 * Usage:
 * ```tsx
 * const webcamRef = useRef<WebcamCaptureHandle>(null);
 *
 * function handleCapture() {
 *   const landmarks = webcamRef.current?.getCurrentLandmarks();
 *   console.log(landmarks);
 * }
 *
 * return <WebcamCapture ref={webcamRef} />;
 * ```
 */

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "@mediapipe/tasks-vision";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Landmark } from "../pose-utils/comparePoses";
import { extractLandmarksFromResult } from "../pose-utils/comparePoses";
import "./webcam-capture.css";

/**
 * Handle returned by useImperativeHandle for WebcamCapture.
 */
export interface WebcamCaptureHandle {
  /**
   * Get the current landmarks from the most recent detection.
   * Returns null if no detection has occurred yet.
   */
  getCurrentLandmarks: () => Landmark[] | null;
  /**
   * Start the webcam stream and pose detection.
   */
  start: () => Promise<void>;
  /**
   * Stop the webcam stream and pose detection.
   */
  stop: () => void;
  /**
   * Check if webcam is currently running.
   */
  isRunning: () => boolean;
  /**
   * Check if the PoseLandmarker model is loaded and ready.
   */
  isModelReady: () => boolean;

  getCurrentFrame: () => HTMLVideoElement | null
}

interface WebcamCaptureProps {
  /** CSS width for the video/canvas display */
  width?: string;
  /** CSS height for the video/canvas display */
  height?: string;
  /** Optional className for the container */
  className?: string;
  /** Optional callback when landmarks are updated */
  onLandmarksUpdate?: (landmarks: Landmark[]) => void;
}

type RunningMode = "IMAGE" | "VIDEO";

/**
 * WebcamCapture component.
 * Renders video and canvas overlay, runs pose detection, and exposes landmarks via ref.
 */
export const WebcamCapture = forwardRef<WebcamCaptureHandle, WebcamCaptureProps>(
  ({ width = "1280px", height = "720px", className = "", onLandmarksUpdate }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Pose detection refs
    const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
    const drawingUtilsRef = useRef<DrawingUtils | null>(null);
    const runningModeRef = useRef<RunningMode>("IMAGE");
    const lastVideoTimeRef = useRef<number>(-1);
    const rafRef = useRef<number | null>(null);

    // State
    const webcamRunningRef = useRef(false);
    const modelReadyRef = useRef(false);

    // Store current landmarks
    const currentLandmarksRef = useRef<Landmark[] | null>(null);

    // Initialize PoseLandmarker on mount
    useEffect(() => {
      async function initModel() {
        try {
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
          );

          try {
            // Try GPU first
            poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                delegate: "GPU"
              },
              runningMode: runningModeRef.current,
              numPoses: 1
            });
            console.log("PoseLandmarker model loaded with GPU delegate");
          } catch (gpuError) {
            // Fallback to CPU on mobile or if GPU fails
            console.warn("GPU delegate failed, falling back to CPU:", gpuError);
            poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                delegate: "CPU"
              },
              runningMode: runningModeRef.current,
              numPoses: 1
            });
            console.log("PoseLandmarker model loaded with CPU delegate");
          }
          
          // Mark model as ready
          modelReadyRef.current = true;
          console.log("PoseLandmarker model ready");
        } catch (error) {
          console.error("Failed to initialize PoseLandmarker:", error);
          modelReadyRef.current = false;
        }
      }

      initModel();
    }, []);

    // Initialize DrawingUtils
    useEffect(() => {
      const canvasCtx = canvasRef.current?.getContext("2d");
      if (canvasCtx && !drawingUtilsRef.current) {
        drawingUtilsRef.current = new DrawingUtils(canvasCtx);
      }
    }, []);

    // Prediction loop
    async function predictWebcam() {
      if (!videoRef.current || !canvasRef.current) return;

      // Set canvas pixel size
      const vw = videoRef.current.videoWidth || 1280;
      const vh = videoRef.current.videoHeight || 720;
      if (canvasRef.current.width !== vw || canvasRef.current.height !== vh) {
        canvasRef.current.width = vw;
        canvasRef.current.height = vh;
      }

      // Set CSS size for display
      canvasRef.current.style.width = width;
      canvasRef.current.style.height = height;
      videoRef.current.style.width = width;
      videoRef.current.style.height = height;

      // Switch to VIDEO mode if needed
      if (runningModeRef.current === "IMAGE") {
        runningModeRef.current = "VIDEO";
        await poseLandmarkerRef.current?.setOptions({ runningMode: "VIDEO" });
      }

      const startTimeMs = performance.now();
      if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
        lastVideoTimeRef.current = videoRef.current.currentTime;

        poseLandmarkerRef.current?.detectForVideo(videoRef.current, startTimeMs, (result: any) => {
          const canvasCtx = canvasRef.current?.getContext("2d");
          if (!canvasCtx || !canvasRef.current) return;

          // Extract and store landmarks
          try {
            const landmarks = extractLandmarksFromResult(result, 0);
            currentLandmarksRef.current = landmarks;
            onLandmarksUpdate?.(landmarks);
          } catch (error) {
            console.error("Error extracting landmarks:", error);
          }

          // Draw landmarks
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          if (drawingUtilsRef.current && result.landmarks && result.landmarks[0]) {
            drawingUtilsRef.current.drawLandmarks(result.landmarks[0], {
              radius: (data: any) => DrawingUtils.lerp(data.from?.z ?? 0, -0.15, 0.1, 5, 1)
            });
            drawingUtilsRef.current.drawConnectors(
              result.landmarks[0],
              PoseLandmarker.POSE_CONNECTIONS
            );
          }

          canvasCtx.restore();
        });
      }

      // Schedule next frame
      if (webcamRunningRef.current) {
        rafRef.current = requestAnimationFrame(predictWebcam);
      }
    }

    // Start webcam
    async function startWebcam() {
      if (!poseLandmarkerRef.current) {
        console.error("PoseLandmarker not initialized");
        return;
      }

      try {
        // Use optimized constraints for better mobile performance
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          },
          audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;
        webcamRunningRef.current = true;

        // Remove any existing listener
        try {
          videoRef.current.removeEventListener("loadeddata", predictWebcam);
        } catch {}

        // Wait for video metadata before starting predictions
        videoRef.current.addEventListener("loadedmetadata", predictWebcam, { once: true });
        videoRef.current.addEventListener("loadeddata", predictWebcam);
        await videoRef.current.play();
        console.log("Webcam started successfully");
      } catch (error) {
        console.error("Failed to start webcam:", error);
        throw error;
      }
    }

    // Stop webcam
    function stopWebcam() {
      webcamRunningRef.current = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const stream = videoRef.current?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach(track => track.stop());

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        try {
          videoRef.current.removeEventListener("loadeddata", predictWebcam);
        } catch {}
      }

      currentLandmarksRef.current = null;
    }

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopWebcam();
      };
    }, []);

    // Expose methods via useImperativeHandle
    useImperativeHandle(ref, () => ({
      getCurrentLandmarks: () => currentLandmarksRef.current,
      start: startWebcam,
      stop: stopWebcam,
      isRunning: () => webcamRunningRef.current,
      isModelReady: () => modelReadyRef.current,
      getCurrentFrame: () => videoRef.current
    }));

    return (
      <div className={`webcam-capture-container ${className}`.trim()} style={{ width, height }}>
        <video
          ref={videoRef}
          className="webcam-capture-video"
          autoPlay
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="webcam-capture-canvas"
          width={1280}
          height={720}
        />
      </div>
    );
  }
);

WebcamCapture.displayName = "WebcamCapture";
