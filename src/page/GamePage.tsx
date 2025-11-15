import { useState } from "react";
import "./GamePage.css";
import StatuesqueGame from "../game/StatuesqueGame";
import { Leaderboard } from "../game/Leaderboard"; // ⬅ add this


export default function GamePage() {
  const [showIntro, setShowIntro] = useState(true);
  const SLIDES = ['/1.png','/2.png','/3.png'];
  const [slideIndex, setSlideIndex] = useState(0);

  return (
    <div className="game-page">
      {showIntro && (
        <div className="intro-overlay" role="dialog" aria-modal="true">
          <button
            className="intro-close"
            aria-label="Close intro"
            onClick={() => setShowIntro(false)}
          >
            ×
          </button>

          <div className="intro-content">
            <img src={SLIDES[slideIndex]} alt={`Intro ${slideIndex+1}`} className="intro-image" />
            <div className="intro-actions">
              {slideIndex < SLIDES.length - 1 ? (
                <button
                  className="intro-next"
                  onClick={() => setSlideIndex((s) => Math.min(s + 1, SLIDES.length - 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  className="intro-next intro-start"
                  onClick={() => setShowIntro(false)}
                >
                  Start
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="game-main">
        <section className="left">
          <div className="detector-area">
            <div className="central-box">
              <StatuesqueGame />
            </div>

            <div className="instructions">
              Use the central box: it will play poses, then switch to camera to
              record your attempt.
            </div>

            <Leaderboard />
          </div>
        </section>
      </main>
    </div>
  );
}