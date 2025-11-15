import { useEffect, useRef, useState } from "react";
import { WebcamCapture, type WebcamCaptureHandle } from "../pose-detection/WebcamCapture";
import type { ComparisonResult } from "../pose-utils/comparePoses";
import {
  comparePoses,
  extractAllPosesFromAssets,
  getAllCachedPoses,
  drawNormalizedLandmarks,
  type StoredPoseData
} from "../pose-utils";

export function TestPage() {
  const webcamRef = useRef<WebcamCaptureHandle>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);

  // State management
  const [availablePoses, setAvailablePoses] = useState<StoredPoseData[]>([]);
  const [selectedPose, setSelectedPose] = useState<StoredPoseData | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);

  // Initialize: extract and load cached poses
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

        // Auto-select first pose if available
        if (cached.length > 0) {
          setSelectedPose(cached[0]);
        }
      } catch (error) {
        console.error("Failed to initialize poses:", error);
      } finally {
        setIsExtracting(false);
      }
    };

    initializePoses();
  }, []);

  // Draw landmarks when pose is selected
  useEffect(() => {
    if (!selectedPose || !poseCanvasRef.current) return;

    const canvas = poseCanvasRef.current;
    // Set a reasonable display size
    canvas.width = 640;
    canvas.height = 480;

    drawNormalizedLandmarks(
      canvas,
      selectedPose.landmarks,
      "#1a1a1a",
      {
        landmarkRadius: 5,
        landmarkColor: "#00FF00",
        connectionColor: "#00FF00",
        connectionWidth: 2
      }
    );
  }, [selectedPose]);

  // Handle pose selection
  function handlePoseChange(poseId: string) {
    const pose = availablePoses.find(p => p.id === poseId);
    if (pose) {
      setSelectedPose(pose);
      setComparisonResult(null);
    }
  }

  // Start webcam
  async function handleStart() {
    try {
      await webcamRef.current?.start();
      setWebcamActive(true);
    } catch (error) {
      console.error("Failed to start webcam:", error);
    }
  }

  // Stop webcam
  function handleStop() {
    webcamRef.current?.stop();
    setWebcamActive(false);
  }

  // Continuous comparison loop
  useEffect(() => {
    if (!webcamActive || !selectedPose) {
      return;
    }

    const comparisonInterval = setInterval(() => {
      const currentLandmarks = webcamRef.current?.getCurrentLandmarks();
      if (!currentLandmarks) {
        return;
      }

      const result = comparePoses(selectedPose.landmarks, currentLandmarks, {
        visibilityThreshold: 0.5,
        distanceThreshold: 0.2,
        similarityThreshold: 0.55,
        useAngles: true,
        angleWeight: 0.4,
      });

      setComparisonResult(result);
    }, 100); // Update every 100ms for smooth feedback

    return () => clearInterval(comparisonInterval);
  }, [webcamActive, selectedPose]);

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif"
  };

  const sectionStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
    backgroundColor: "#f5f5f5",
    borderRadius: "8px",
    border: "1px solid #ddd"
  };

  const controlsStyles: React.CSSProperties = {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap"
  };

  const buttonStyles: React.CSSProperties = {
    padding: "10px 16px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s"
  };

  const secondaryButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: "#6c757d"
  };

  const selectStyles: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "14px",
    cursor: "pointer"
  };

  const resultBoxStyles: React.CSSProperties = {
    padding: "16px",
    backgroundColor: "#fff",
    border: "2px solid #ddd",
    borderRadius: "8px",
    marginTop: "12px"
  };

  const matchingResultStyles: React.CSSProperties = {
    ...resultBoxStyles,
    borderColor: comparisonResult?.isMatching ? "#28a745" : "#dc3545",
    backgroundColor: comparisonResult?.isMatching ? "#f0fff4" : "#fff5f5"
  };

  const canvasContainerStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    backgroundColor: "#000",
    borderRadius: "8px",
    overflow: "hidden"
  };

  const canvasStyles: React.CSSProperties = {
    maxWidth: "100%",
    height: "auto"
  };

  return (
    <div style={containerStyles}>
      <h1>Pose Matching Tester</h1>

      {/* Pose Selection */}
      <div style={sectionStyles}>
        <h2>Step 1: Select Reference Pose</h2>
        {isExtracting ? (
          <p>Extracting poses from assets...</p>
        ) : (
          <>
            <label htmlFor="pose-select">
              Available Poses ({availablePoses.length}):
            </label>
            <select
              id="pose-select"
              value={selectedPose?.id || ""}
              onChange={(e) => handlePoseChange(e.target.value)}
              style={selectStyles}
            >
              <option value="">-- Select a pose --</option>
              {availablePoses.map((pose) => (
                <option key={pose.id} value={pose.id}>
                  {pose.filename}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Reference Pose Display */}
      {selectedPose && (
        <div style={sectionStyles}>
          <h2>Reference Pose: {selectedPose.filename}</h2>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>
            Landmarks detected: {selectedPose.landmarks.length}
          </p>
          <div style={canvasContainerStyles}>
            <canvas
              ref={poseCanvasRef}
              style={canvasStyles}
              width={640}
              height={480}
            />
          </div>
        </div>
      )}

      {/* Webcam Capture */}
      <div style={sectionStyles}>
        <h2>Step 2: Capture Your Pose</h2>
        <div style={controlsStyles}>
          <button
            onClick={handleStart}
            disabled={webcamActive}
            style={{
              ...buttonStyles,
              opacity: webcamActive ? 0.6 : 1,
              cursor: webcamActive ? "not-allowed" : "pointer"
            }}
          >
            Start Webcam
          </button>
          <button
            onClick={handleStop}
            disabled={!webcamActive}
            style={{
              ...secondaryButtonStyles,
              opacity: !webcamActive ? 0.6 : 1,
              cursor: !webcamActive ? "not-allowed" : "pointer"
            }}
          >
            Stop Webcam
          </button>
        </div>
        {webcamActive && selectedPose && (
          <div style={{ marginTop: "12px", fontSize: "14px", color: "#666" }}>
            ✓ Comparing in real-time...
          </div>
        )}
        <div
          style={{
            marginTop: "12px",
            borderRadius: "8px",
            overflow: "hidden"
          }}
        >
          <WebcamCapture ref={webcamRef} width="640px" height="480px" />
        </div>
      </div>

      {/* Real-time Comparison Results */}
      {webcamActive && comparisonResult && (
        <div style={matchingResultStyles}>
          <h2 style={{ margin: "0 0 12px 0" }}>
            {comparisonResult.isMatching ? "✓ Pose Match!" : "○ Matching..."}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <strong>Similarity Score:</strong>
              <div
                style={{
                  fontSize: "28px",
                  marginTop: "4px",
                  fontWeight: "bold",
                  color: comparisonResult.isMatching ? "#28a745" : "#dc3545"
                }}
              >
                {(comparisonResult.similarity * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <strong>Mean Distance:</strong>
              <div style={{ fontSize: "24px", marginTop: "4px" }}>
                {comparisonResult.meanDistance.toFixed(3)}
              </div>
            </div>
            <div>
              <strong>Valid Landmarks:</strong>
              <div>{comparisonResult.validLandmarks} / {comparisonResult.landmarksCompared}</div>
            </div>
            <div>
              <strong>Compared Regions:</strong>
              <div>{comparisonResult.comparedRegions.join(", ") || "None"}</div>
            </div>
          </div>
          {comparisonResult.regionDistances && (
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
              <strong>Region Breakdown:</strong>
              <div style={{ marginTop: "8px", fontSize: "12px" }}>
                {Object.entries(comparisonResult.regionDistances).map(([region, distance]) => (
                  <div key={region}>
                    {region}: {distance.toFixed(3)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Idle state when webcam is not active */}
      {!webcamActive && !comparisonResult && selectedPose && (
        <div style={matchingResultStyles}>
          <p style={{ margin: 0, textAlign: "center", color: "#999" }}>
            Start the webcam to see real-time pose matching
          </p>
        </div>
      )}
    </div>
  );
}