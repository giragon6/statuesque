import { useEffect, useRef, useState } from "react";
import { WebcamCapture, type WebcamCaptureHandle } from "../pose-detection/WebcamCapture";
import { extractAllPosesFromAssets, getAllCachedPoses, comparePoses, type StoredPoseData, type ComparisonResult } from "../pose-utils";
import { drawPoseImageWithLandmarks } from "../pose-utils/drawLandmarks";
import { supabase } from "../lib/supabaseClient";


const MATCH_THRESHOLD = 0.45;
const COUNTDOWN_LEN = 4;
const BETWEEN_LEVEL = 3;

export default function StatuesqueGame() {
  const [started, setStarted] = useState(false);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<"idle" | "show" | "webcam" | "ending" | "gameover" | "level-complete">("idle");
  const [poseIndex, setPoseIndex] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_LEN);

  const [availablePoses, setAvailablePoses] = useState<StoredPoseData[]>([]);
  const [selectedPoses, setSelectedPoses] = useState<StoredPoseData[]>([]);
  const [poseSequence, setPoseSequence] = useState<string[]>([]); 
  const [similarityResults, setSimilarityResults] = useState<(number | null)[]>([]);

  const [isExtracting, setIsExtracting] = useState(true);
  const [isWebcamReady, setIsWebcamReady] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);

  const webcamRef = useRef<WebcamCaptureHandle>(null);
  const comparisonIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const comparisonResultRef = useRef<ComparisonResult | null>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);

  const poseCount = level;
  const currentPose = selectedPoses[poseIndex] || null;

  useEffect(() => {
    const initPoses = async () => {
      setIsExtracting(true);
      try {
        await extractAllPosesFromAssets();
        const cached = await getAllCachedPoses();
        console.log("Loaded poses:", cached);
        setAvailablePoses(cached);
      } catch (error) {
        console.error("Failed to initialize poses:", error);
      } finally {
        setIsExtracting(false);
      }
    };

    initPoses();
  }, []);

  // ===== 1b. INITIALIZE WEBCAM =====
  useEffect(() => {
    const initWebcam = async () => {
      // Poll until model is ready (checks every 100ms)
      while (!webcamRef.current?.isModelReady?.()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      try {
        console.log("Model ready, starting webcam...");
        await webcamRef.current.start();
        console.log("Webcam started successfully");
        setIsWebcamReady(true);
      } catch (error) {
        console.error("Failed to start webcam:", error);
        setIsWebcamReady(false);
      }
    };

    initWebcam();
  }, []);

  // ===== 2. LOAD POSES FOR CURRENT LEVEL =====
  useEffect(() => {
    if (!started || availablePoses.length === 0) return;

    // Generate initial sequence if needed
    if (poseSequence.length === 0) {
      // Start with a large sequence - generate on-demand as needed
      const initialSequenceLength = Math.max(level + 10, 16);
      const newSequence: string[] = [];
      
      for (let i = 0; i < initialSequenceLength; i++) {
        const randomPoseId = availablePoses[Math.floor(Math.random() * availablePoses.length)].id;
        newSequence.push(randomPoseId);
      }
      
      setPoseSequence(newSequence);
    } else {
      // Extend sequence if needed for higher levels
      if (poseSequence.length < poseCount) {
        const newSequence = [...poseSequence];
        while (newSequence.length < poseCount + 10) {
          const randomPoseId = availablePoses[Math.floor(Math.random() * availablePoses.length)].id;
          newSequence.push(randomPoseId);
        }
        setPoseSequence(newSequence);
      }

      // Select poses based on current level's sequence
      const poseIds = poseSequence.slice(0, poseCount);
      const posesForLevel = poseIds.map(id => 
        availablePoses.find(p => p.id === id)!
      ).filter(Boolean);

      setSelectedPoses(posesForLevel);
      setSimilarityResults(new Array(posesForLevel.length).fill(null));
    }
  }, [started, availablePoses, level, poseSequence, poseCount]);

  // ===== 3. DRAW LANDMARKS ON SHOWN POSE =====
  useEffect(() => {
    if (phase !== "show" || !currentPose || !poseCanvasRef.current) return;

    const drawLandmarks = async () => {
      try {
        await drawPoseImageWithLandmarks(
          poseCanvasRef.current!,
          currentPose.imageUrl,
          currentPose.landmarks,
          {
            landmarkRadius: 6,
            landmarkColor: "#FF6B6B",
            connectionColor: "#FF6B6B",
            connectionWidth: 3
          }
        );
      } catch (error) {
        console.error("Failed to draw pose landmarks:", error);
      }
    };

    drawLandmarks();
  }, [phase, currentPose]);

  // ===== 4. CONTINUOUS POSE COMPARISON (100ms) =====
  useEffect(() => {
    if (phase !== "webcam" || !currentPose) return;

    comparisonIntervalRef.current = setInterval(() => {
      const landmarks = webcamRef.current?.getCurrentLandmarks();
      if (!landmarks) return;

      const result = comparePoses(currentPose.landmarks, landmarks, {
        visibilityThreshold: 0.5,
        distanceThreshold: 0.2,
        similarityThreshold: 0.55,
        useAngles: true,
        angleWeight: 0.4,
      });
      comparisonResultRef.current = result;
    }, 100);

    return () => {
      if (comparisonIntervalRef.current) clearInterval(comparisonIntervalRef.current);
    };
  }, [phase, currentPose]);

  // ===== 5. COUNTDOWN HELPER =====
  // Creates a countdown that ticks down locally and calls callback when done
  function startCountdown(onComplete: () => void): () => void {
    let remaining = COUNTDOWN_LEN;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining--;
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }

  // ===== 5b. TRIGGER COUNTDOWN ON PHASE/POSEINDEX CHANGE =====
  useEffect(() => {
    if (!started || !currentPose) return;

    const cleanup = startCountdown(() => {
      if (phase === "show") {
        // Move to next show pose or start webcam phase
        setPoseIndex((prev) => {
          if (prev < poseCount - 1) return prev + 1;
          setPhase("webcam");
          return 0;
        });
      } else if (phase === "webcam") {
        // Record similarity result for this pose
        const similarity = comparisonResultRef.current?.similarity ?? 0;
        setSimilarityResults((prev) => {
          const updated = [...prev];
          updated[poseIndex] = similarity;
          return updated;
        });

        setPoseIndex((prev) => {
          if (prev < poseCount - 1) {
            comparisonResultRef.current = null;
            return prev + 1;
          } else {
            const allResults = [...similarityResults];
            allResults[poseIndex] = similarity;
            
            const anyFailed = allResults.some((s) => (s ?? 0) < MATCH_THRESHOLD);
            
            if (anyFailed) {
              setPhase("gameover");
            } else {
              // Continue to next level indefinitely
              setPhase("level-complete");
              setLevel((l) => l + 1);
            }
            return prev;
          }
        });
      }
    });

    return cleanup;
  }, [started, phase, poseIndex, level, currentPose, poseCount]);

  // ===== 5c. LEVEL COMPLETE SPLASH SCREEN =====
  useEffect(() => {
    if (phase !== "level-complete") return;

    let remaining = BETWEEN_LEVEL;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining--;
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setPoseIndex(0);
        setPhase("show");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // ===== 5d. POSE INDEX CHANGE PULSE EFFECT =====
  useEffect(() => {
    if (phase === "webcam") {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [poseIndex, phase]);

  // ===== ----- ACCURACY (HIGHEST SIMILARITY) -----
  const accuracy = similarityResults.length > 0
    ? Math.round(Math.max(...similarityResults.map(s => s ?? 0)) * 100)
    : 0;

  // ===== ----- SUBMIT SCORE TO SUPABASE -----
  const submitScore = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name");
      return;
    }

    setIsSubmittingScore(true);
    try {
      const { error } = await supabase.from("scores").insert([
        {
          name: playerName.trim(),
          accuracy: accuracy,
          highest_level: level,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error("Error submitting score:", error.message);
        alert("Failed to submit score. Please try again.");
      } else {
        alert("Score submitted! Thanks for playing!");
        // Reset the game
        setStarted(false);
        setPhase("idle");
        setLevel(1);
        setPoseIndex(0);
        setPoseSequence([]);
        setSelectedPoses([]);
        setSimilarityResults([]);
        setPlayerName("");
      }
    } catch (error) {
      console.error("Error submitting score:", error);
      alert("An error occurred while submitting your score.");
    } finally {
      setIsSubmittingScore(false);
    }
  };



  // ===== ----- RENDER: MAIN =====
  return (
    <div className="statuesque-root">
      <div className="statuesque-container">
        {/* LEFT PANEL: WEBCAM */}
        <div className="statuesque-left-panel">
          <div className="webcam-container">
            <WebcamCapture ref={webcamRef} width="100%" height="100%" />
          </div>
        </div>

        {/* RIGHT PANEL: POSE OR WEBCAM INFO */}
        <div className="statuesque-right-panel">
          {/* SHOW PHASE: Display reference pose with landmarks */}
          {started && phase === "show" && currentPose && (
            <div className="pose-display">
              <canvas
                ref={poseCanvasRef}
                className="pose-display-canvas"
              />
              <div className="pose-info">
                <div className="level-indicator">Level {level}</div>
                <div className="pose-counter">
                  Pose {poseIndex + 1} / {poseCount}
                </div>
                <div className="countdown-display">
                  Next in <span className="countdown-number">{countdown}s</span>
                </div>
              </div>
            </div>
          )}

          {/* WEBCAM PHASE: Show current pose index */}
          {started && phase === "webcam" && (
            <div className={`webcam-phase-info ${isPulsing ? "pulsing" : ""}`.trim()}>
              <div className="level-indicator">Level {level}</div>
              <div className="pose-counter">
                Pose {poseIndex + 1} / {poseCount}
              </div>
              <div className="countdown-display">
                Time left: <span className="countdown-number">{countdown}s</span>
              </div>
            </div>
          )}

          {/* IDLE PHASE: Welcome message */}
          {!started && phase === "idle" && (
            <div className="idle-message">
              <h2>Statuesque</h2>
              <button
                onClick={() => {
                  setStarted(true);
                  setLevel(1);
                  setPoseIndex(0);
                  setPoseSequence([]);
                  setPhase("show");
                }}
                disabled={isExtracting || !isWebcamReady}
                className="start-button"
              >
                {isExtracting ? "LOADING POSES..." : !isWebcamReady ? "LOADING CAMERA..." : "START"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* LEVEL COMPLETE MODAL OVERLAY */}
      {phase === "level-complete" && (
        <div className="statuesque-overlay">
          <div className="statuesque-modal">
            <h2>Level {level - 1} Complete!</h2>
            <p>Get ready for Level {level}...</p>
            <div className="countdown-display">
              Starting in <span className="countdown-number">{countdown}s</span>
            </div>
          </div>
        </div>
      )}

      {/* ENDING MODAL OVERLAY */}
      {phase === "ending" && (
        <div className="statuesque-overlay">
          <div className="statuesque-modal">
            <h2>Great Run!</h2>
            <p>You reached Level {level}!</p>
            <p>Highest Similarity: {accuracy}%</p>
            
            <div className="game-results-container">
              <h3>Session Results:</h3>
              {selectedPoses.map((pose, idx) => (
                <div key={idx} className="result-item">
                  <div>Pose {idx + 1}: {pose.filename}</div>
                  <div>Similarity: {((similarityResults[idx] ?? 0) * 100).toFixed(1)}%</div>
                  <div className={(similarityResults[idx] ?? 0) >= MATCH_THRESHOLD ? "result-passed" : "result-failed"}>
                    {(similarityResults[idx] ?? 0) >= MATCH_THRESHOLD ? "✓ Match" : "✗ Failed"}
                  </div>
                </div>
              ))}
            </div>

            <div className="score-submission">
              <input
                type="text"
                placeholder="Enter your name to save score"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSubmittingScore) {
                    submitScore();
                  }
                }}
                className="player-name-input"
              />
              <div className="modal-button-group">
                <button
                  onClick={submitScore}
                  disabled={isSubmittingScore || !playerName.trim()}
                  className="submit-score-button"
                >
                  {isSubmittingScore ? "SUBMITTING..." : "SUBMIT SCORE"}
                </button>
                <button
                  onClick={() => {
                    setStarted(false);
                    setPhase("idle");
                    setLevel(1);
                    setPoseIndex(0);
                    setPoseSequence([]);
                    setSelectedPoses([]);
                    setSimilarityResults([]);
                    setPlayerName("");
                  }}
                  className="restart-button"
                >
                  Play Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAMEOVER MODAL OVERLAY */}
      {phase === "gameover" && (
        <div className="statuesque-overlay">
          <div className="statuesque-modal">
            <h2>Game Over!</h2>
            <img src="/orpheus_gj.png" width="100%"></img>
            <p>You failed to match all poses in Level {level}.</p>
            <p>Highest Similarity: {accuracy}%</p>
            
            <div className="game-results-container">
              <h3>Level {level} Results:</h3>
              {selectedPoses.map((pose, idx) => (
                <div key={idx} className="result-item">
                  <div>Pose {idx + 1}: {pose.filename}</div>
                  <div>Similarity: {((similarityResults[idx] ?? 0) * 100).toFixed(1)}%</div>
                  <div className={(similarityResults[idx] ?? 0) >= MATCH_THRESHOLD ? "result-passed" : "result-failed"}>
                    {(similarityResults[idx] ?? 0) >= MATCH_THRESHOLD ? "✓ Match" : "✗ Failed"}
                  </div>
                </div>
              ))}
            </div>

            <div className="score-submission">
              <input
                type="text"
                placeholder="Enter your name to save score"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSubmittingScore) {
                    submitScore();
                  }
                }}
                className="player-name-input"
              />
              <div className="modal-button-group">
                <button
                  onClick={submitScore}
                  disabled={isSubmittingScore || !playerName.trim()}
                  className="submit-score-button"
                >
                  {isSubmittingScore ? "SUBMITTING..." : "SUBMIT SCORE"}
                </button>
                <button
                  onClick={() => {
                    setStarted(false);
                    setPhase("idle");
                    setLevel(1);
                    setPoseIndex(0);
                    setPoseSequence([]);
                    setSelectedPoses([]);
                    setSimilarityResults([]);
                    setPlayerName("");
                  }}
                  className="restart-button"
                >
                  Play Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
