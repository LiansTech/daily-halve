import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DayStats {
  totalPlays: number;
  avgScore: number;
  avgLeftPct: number;
  bestScore: number;
  bestLeftPct: number;
  scores: number[]; // raw scores for distribution chart
}

// ── Save a result ─────────────────────────────────────────────────────────────
export async function saveResult(
  dayNumber: number,
  leftPct: number,
  rightPct: number,
  score: number,
): Promise<void> {
  await supabase.from("game_results").insert({
    day_number: dayNumber,
    left_pct: leftPct,
    right_pct: rightPct,
    score,
  });
}

// ── Fetch today's stats ───────────────────────────────────────────────────────
export async function fetchDayStats(dayNumber: number): Promise<DayStats | null> {
  const { data, error } = await supabase
    .from("game_results")
    .select("left_pct, score")
    .eq("day_number", dayNumber);

  if (error || !data || data.length === 0) return null;

  const scores = data.map((r) => r.score);
  const totalPlays = data.length;
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / totalPlays);
  const avgLeftPct = data.reduce((s, r) => s + r.left_pct, 0) / totalPlays;

  const best = data.reduce((b, r) =>
    Math.abs(r.left_pct - 50) < Math.abs(b.left_pct - 50) ? r : b,
  );

  return {
    totalPlays,
    avgScore,
    avgLeftPct,
    bestScore: best.score,
    bestLeftPct: best.left_pct,
    scores,
  };
}
