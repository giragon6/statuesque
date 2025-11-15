import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Score = {
  id: number;
  name: string;
  accuracy: number;
  created_at: string;
};

export function Leaderboard() {
  const [scores, setScores] = useState<Score[]>([]);

  useEffect(() => {
    async function loadScores() {
      const { data, error } = await supabase
        .from("scores")
        .select("*")
        .order("accuracy", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(10);

      if (error) {
        console.error("Error loading scores:", error.message);
        return;
      }

      setScores(data as Score[]);
    }

    loadScores();
  }, []);

  if (!scores.length) {
    return <p className="meta">No scores yet. Be the first to play!</p>;
  }

  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      <ol>
        {scores.map((s, i) => (
          <li key={s.id}>
            {i + 1}. <strong>{s.name}</strong> — {s.accuracy}%
          </li>
        ))}
      </ol>
    </div>
  );
}
