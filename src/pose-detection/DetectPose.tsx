// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

type RunningMode = "IMAGE" | "VIDEO";

export function DetectPose() {
  const videoHeight = "360px";
  const videoWidth = "480px";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // persistent, mutable values that shouldn't trigger re-renders
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const runningModeRef = useRef<RunningMode>("IMAGE");
  const lastVideoTimeRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);
  // store latest detection result so we can save it on demand
  const lastResultRef = useRef<any | null>(null);

  // save/countdown state
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // UI state
  const [webcamRunning, setWebcamRunning] = useState(false);
  // mirror running state in a ref to avoid stale closures inside rAF loop
  const webcamRunningRef = useRef<boolean>(false);

  /********************************************************************
  // Demo 2: Continuously grab image from webcam stream and detect it.
  ********************************************************************/

  useEffect(() => {
    // defer creating DrawingUtils until we know the canvas pixel size (created later)
    // keep this effect in case canvasRef changes
    const canvasCtx = canvasRef.current && canvasRef.current.getContext("2d");
    if (canvasCtx && !drawingUtilsRef.current) drawingUtilsRef.current = new DrawingUtils(canvasCtx);
  }, []);

  // Load the model once after mount
  useEffect(() => {
    let mounted = true;
    async function createPoseLandmarker() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      if (!mounted) return;
      poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU"
        },
        runningMode: runningModeRef.current,
        numPoses: 2
      });
    }
    createPoseLandmarker();
    return () => { mounted = false; };
  }, []);


  // Enable the live webcam view and start/stop detection.
  async function enableCam() {
    const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
    if (!hasGetUserMedia()) {
      console.warn("getUserMedia() is not supported by your browser");
      return;
    }
    if (!poseLandmarkerRef.current) {
      console.log("Wait! poseLandmarker not loaded yet.");
      return;
    }

    if (webcamRunning) {
      // stop
      setWebcamRunning(false);
      webcamRunningRef.current = false;
      // stop media tracks and cancel animation
      const stream = videoRef.current?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    } else {
      // start
      setWebcamRunning(true);
      webcamRunningRef.current = true;
      const constraints = { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      // start prediction when video is ready
      // remove any existing listener to avoid duplicates, then add
      try { videoRef.current.removeEventListener("loadeddata", predictWebcam); } catch {}
      videoRef.current.addEventListener("loadeddata", predictWebcam);
      // ensure playback starts
      try { await videoRef.current.play(); } catch (e) { /* play may be blocked */ }
    }
  }

  async function predictWebcam() {
    // ensure canvas pixel size matches the video for accurate drawing
    if (videoRef.current && canvasRef.current) {
      const vw = videoRef.current.videoWidth || 1280;
      const vh = videoRef.current.videoHeight || 720;
      if (canvasRef.current.width !== vw || canvasRef.current.height !== vh) {
        canvasRef.current.width = vw;
        canvasRef.current.height = vh;
      }
      canvasRef.current.style.height = videoHeight;
      canvasRef.current.style.width = videoWidth;
    }
    const canvasCtx = canvasRef.current && canvasRef.current.getContext("2d");
    if (canvasCtx && !drawingUtilsRef.current) drawingUtilsRef.current = new DrawingUtils(canvasCtx);
    if (videoRef.current) {
      videoRef.current.style.height = videoHeight;
      videoRef.current.style.width = videoWidth;
    }

    if (runningModeRef.current === "IMAGE") {
      runningModeRef.current = "VIDEO";
      await poseLandmarkerRef.current!.setOptions({ runningMode: "VIDEO" });
    }

    const startTimeMs = performance.now();
    if (videoRef.current && lastVideoTimeRef.current !== videoRef.current.currentTime) {
      lastVideoTimeRef.current = videoRef.current.currentTime;
      poseLandmarkerRef.current!.detectForVideo(videoRef.current, startTimeMs, (result: any) => {
        if (!canvasCtx || !canvasRef.current) return;
        // keep latest result for manual saving
        lastResultRef.current = result;
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        if (drawingUtilsRef.current) {
          for (const landmark of result.worldLandmarks) {
            drawingUtilsRef.current.drawLandmarks(landmark, {
              radius: (data: any) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1)
            });
            drawingUtilsRef.current.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
          }
        }
        canvasCtx.restore();
      });
    }

    // schedule next frame while running (check ref to avoid stale closure)
    if (webcamRunningRef.current) {
      rafRef.current = window.requestAnimationFrame(predictWebcam);
    }
  }

  const webcamStyles: React.CSSProperties = {
    width: "1280px",
    height: "720px",
    position: "absolute",
    zIndex: 1
  };

  const canvasStyles: React.CSSProperties = {
    left: "0px",
    top: "0px",
    position: "absolute",
    zIndex: 1
  };

  const buttonStyles: React.CSSProperties = {
    position: "absolute",
    left: 8,
    top: 8,
    zIndex: 20
  };

  // cleanup on unmount: stop camera and cancel animation
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      // clear countdown interval if running
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, []);

  // start a 5-second countdown then save the latest result to a file
  function startSaveCountdown() {
    // if already saving, ignore
    if (saving) return;
    setSaving(true);
    setCountdown(5);
    // ensure any existing interval cleared
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          // finish countdown
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setCountdown(null);
          setSaving(false);
          doSave();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  }

  function doSave() {
    const data = lastResultRef.current ?? { message: "no result captured" };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pose_result_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button ref={buttonRef} style={buttonStyles} onClick={enableCam}>
        {webcamRunning ? "DISABLE PREDICTIONS" : "ENABLE PREDICTIONS"}
      </button>
      <button
        style={{ ...buttonStyles, left: 160 }}
        onClick={startSaveCountdown}
        disabled={saving}
      >
        {saving ? `Saving in ${countdown ?? 5}s...` : "Save result in 5s"}
      </button>
      <video ref={videoRef} id="webcam" style={webcamStyles} autoPlay playsInline></video>
      <canvas ref={canvasRef} id="outputCanvas" width="1280" height="720" style={canvasStyles}></canvas>
    </>
  );
}
 