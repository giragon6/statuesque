import { useEffect, useRef, useState } from "react";
import { WebcamCapture, type WebcamCaptureHandle } from "../pose-detection/WebcamCapture";
import { extractAllPosesFromAssets, getAllCachedPoses, comparePoses, type StoredPoseData, type ComparisonResult } from "../pose-utils";

// ----- CONSTANTS -----
const TOTAL_LEVELS = 5;
const MATCH_THRESHOLD = 0.6; // Similarity threshold for a successful match

export default function StatuesqueGameOld() {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(1); // 1..5
  const [phase, setPhase] =
    useState<"idle" | "show" | "webcam" | "ending">("idle");

  const [poseIndex, setPoseIndex] = useState(0); // 0..poseCount-1

  const [showCountdown, setShowCountdown] = useState(3);
  const [webcamCountdown, setWebcamCountdown] = useState(3);

  const [availablePoses, setAvailablePoses] = useState<StoredPoseData[]>([]);
  const [selectedPoses, setSelectedPoses] = useState<StoredPoseData[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [matches, setMatches] = useState<boolean[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const webcamRef = useRef<WebcamCaptureHandle>(null);
  const comparisonIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Level N has N+1 poses → 2,3,4,5,6
  const poseCount = level + 1;
  const currentPose = selectedPoses[poseIndex] || null;
  const totalPoses = 2 + 3 + 4 + 5 + 6; // 20 total poses across all levels

  // ----- Webcam helpers -----
  const startWebcam = async () => {
    try {
      if (streamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (webcamRef.current) {
        await webcamRef.current?.start();
      }
    } catch (err) {
      console.error("Webcam start error:", err);
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (webcamRef.current) {
      webcamRef.current?.stop();
    }
  };

  useEffect(() => {
    const initializePoses = async () => {
      setIsExtracting(true);
      try {
        await extractAllPosesFromAssets({
          onProgress: (current, total, filename) => {
            console.log(`Extracting poses: ${current}/${total} - ${filename}`);
          }
        });

        const cached = await getAllCachedPoses();
        setAvailablePoses(cached);
      } catch (error) {
        console.error("Failed to initialize poses:", error);
      } finally {
        setIsExtracting(false);
      }
    };

    const initializeCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        setCameraReady(true);
      } catch (error) {
        console.error("Camera not available:", error);
        setCameraReady(false);
      }
    };

    initializePoses();
    initializeCamera();
  }, []);

  // Select poses for current level when started or level changes
  useEffect(() => {
    if (availablePoses.length === 0) return;
    
    // Select N+1 random poses for this level
    const shuffled = [...availablePoses].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, poseCount);
    setSelectedPoses(selected);
    setMatches(new Array(selected.length).fill(false));
  }, [level, availablePoses, poseCount, started]);

  // turn webcam on/off when phase changes
  useEffect(() => {
    if (started && phase === "webcam") {
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => {
      stopWebcam();
    };
  }, [started, phase]);



  // ----- SHOW PHASE: 3s per pose -----
  useEffect(() => {
    if (!started || phase !== "show" || selectedPoses.length === 0) return;

    setShowCountdown(3);
    let remaining = 3;

    const id = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setShowCountdown(remaining);
      } else {
        clearInterval(id);
        // advance pose or switch phase
        setPoseIndex((prev) => {
          if (prev < poseCount - 1) {
            return prev + 1; // next pose in show phase
          } else {
            setPhase("webcam");
            return 0; // reset for webcam phase
          }
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, [started, phase, poseCount, selectedPoses]);

  // ----- WEBCAM PHASE: 3..2..1 per pose, check for match, capture at 0 -----
  useEffect(() => {
    if (!started || phase !== "webcam" || selectedPoses.length === 0) return;

    setWebcamCountdown(3);
    let remaining = 3;

    const id = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setWebcamCountdown(remaining);
      } else {
        clearInterval(id);
        // Check if pose matched
        if (comparisonResult && comparisonResult.similarity >= MATCH_THRESHOLD) {
          setMatches((prev) => {
            const updated = [...prev];
            updated[poseIndex] = true;
            return updated;
          });
        }

        setPoseIndex((prev) => {
          if (prev < poseCount - 1) {
            // next pose in webcam phase
            setComparisonResult(null);
            return prev + 1;
          } else {
            // finished webcam phase for this level
            if (level < TOTAL_LEVELS) {
              setLevel((prevLevel) => prevLevel + 1);
              setPhase("show");
              return 0;
            } else {
              setPhase("ending");
              return prev;
            }
          }
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, [started, phase, poseCount, selectedPoses, comparisonResult]);

  // Continuous pose comparison loop during webcam phase
  useEffect(() => {
    if (phase !== "webcam" || !currentPose) {
      if (comparisonIntervalRef.current) {
        clearInterval(comparisonIntervalRef.current);
      }
      return;
    }

    comparisonIntervalRef.current = setInterval(() => {
      const currentLandmarks = webcamRef.current?.getCurrentLandmarks();
      if (!currentLandmarks) return;

      const result = comparePoses(currentPose.landmarks, currentLandmarks, {
        visibilityThreshold: 0.5,
        distanceThreshold: 0.2,
        similarityThreshold: 0.55,
        useAngles: true,
        angleWeight: 0.4
      });

      setComparisonResult(result);
    }, 100);

    return () => {
      if (comparisonIntervalRef.current) {
        clearInterval(comparisonIntervalRef.current);
      }
    };
  }, [phase, currentPose]);

  // ----- Accuracy -----
  const accuracy =
    totalPoses > 0 ? Math.round((matches.filter(m => m).length / totalPoses) * 100) : 0;

  // ----- UI -----
  if (phase === "ending") {
    return (
      <div className="statuesque-root">
        <div className="statuesque-info">
          <h2>You Finished All 5 Levels!</h2>
          <p>Accuracy: {accuracy}%</p>
          <p>
            Matched {matches.filter(m => m).length} poses out of {totalPoses}.
          </p>
        </div>

        <button
          onClick={() => {
            setStarted(false);
            setPhase("idle");
            setLevel(1);
            setPoseIndex(0);
            setMatches([]);
            setSelectedPoses([]);
          }}
        >
          Restart
        </button>
      </div>
    );
  }


  return (
    <div className="statuesque-root">
      {!started && (
        <button
          onClick={() => {
            setStarted(true);
            setLevel(1);
            setPoseIndex(0);
            setMatches(new Array(poseCount).fill(false));
            setPhase("show");
          }}
          disabled={isExtracting || !cameraReady}
        >
          {isExtracting ? "LOADING POSES..." : !cameraReady ? "REQUESTING CAMERA..." : "START"}
        </button>
      )}

      {started && phase === "show" && currentPose && (
        <>
          <div className="pose-screen">
            <img
              src={"../assets/poses/"+currentPose.imageUrl}
              alt={currentPose.filename}
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: "8px"
              }}
            />
          </div>
          <div className="statuesque-info">
            <div>Level {level}</div>
            <div>
              Pose {poseIndex + 1} / {poseCount} – next in {showCountdown}s
            </div>
          </div>
        </>
      )}

      {/* WebcamCapture always loaded but hidden when not in webcam phase */}
      <div
        className="camera-wrap"
        style={{ display: phase === "webcam" ? "block" : "none" }}
      >
        <WebcamCapture ref={webcamRef} width="640px" height="480px" />
      </div>

      {started && phase === "webcam" && (
        <div className="statuesque-info">
          <div>
            Level {level} – Pose {poseIndex + 1} / {poseCount}
          </div>
          <div>Countdown: {webcamCountdown}s</div>
          {comparisonResult && (
            <div style={{ marginTop: "12px", fontSize: "14px" }}>
              <div>
                Similarity: <strong>{(comparisonResult.similarity * 100).toFixed(1)}%</strong>
              </div>
              <div style={{ color: comparisonResult.similarity >= MATCH_THRESHOLD ? "#28a745" : "#dc3545" }}>
                {comparisonResult.similarity >= MATCH_THRESHOLD ? "✓ Match!" : "○ Try to match..."}
              </div>
            </div>
          )}
        </div>
      )}

      {!started && phase === "idle" && (
        <div className="statuesque-info">
          Press START to begin Statuesque.
        </div>
      )}
    </div>
  );
}
