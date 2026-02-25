"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import { saveResult, fetchDayStats, type DayStats } from "@/lib/supabase";
import type { CutResult } from "./AppleScene";

// Three.js requires browser APIs — load the scene client-side only
const AppleScene = dynamic(() => import("./AppleScene"), { ssr: false });

// ── Score helpers ─────────────────────────────────────────────────────────────
function calcScore(pct: number) {
  return Math.max(0, Math.round(1000 * (1 - Math.abs(50 - pct) / 50)));
}

function scoreLabel(s: number) {
  if (s >= 995) return "🎯 Unbelievable!";
  if (s >= 950) return "🔥 Perfect cut!";
  if (s >= 850) return "✂️ Clean slice!";
  if (s >= 650) return "👍 Pretty good!";
  if (s >= 400) return "😬 Off balance…";
  return "💀 Back to cooking school";
}

function buildShareText(day: number, leftPct: number, rightPct: number, score: number) {
  const block =
    score >= 950 ? "🟩" : score >= 750 ? "🟨" : score >= 500 ? "🟧" : "🟥";
  const leftBlocks = Math.round(leftPct / 10);
  const bar = block.repeat(leftBlocks) + "✂️" + block.repeat(10 - leftBlocks);
  return [
    `✂️ Daily Halve #${day}`,
    "",
    bar,
    `${leftPct.toFixed(1)}% · ${rightPct.toFixed(1)}%`,
    `${score} / 1000  ${scoreLabel(score)}`,
    "",
    "http://daily-halve.com",
  ].join("\n");
}

// ── Balance scale ─────────────────────────────────────────────────────────────
function BalanceScale({ leftPct, rightPct, visible }: {
  leftPct: number; rightPct: number; visible: boolean;
}) {
  const ARM = 78, PX = 130, PY = 56, PAN_R = 22, PAN_DEPTH = 12;
  const tilt = Math.max(-38, Math.min(38, (leftPct - 50) * 1.4));
  const rad = (tilt * Math.PI) / 180;
  const lx = PX - ARM * Math.cos(rad), ly = PY + ARM * Math.sin(rad);
  const rx = PX + ARM * Math.cos(rad), ry = PY - ARM * Math.sin(rad);
  const lColor = leftPct > rightPct ? "var(--accent)" : "#f5f5f5";
  const rColor = rightPct > leftPct ? "var(--accent)" : "#f5f5f5";
  const tr = visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none";

  return (
    <svg viewBox="0 0 260 160" className={`${styles.scale} ${visible ? styles.scaleVisible : ""}`}>
      <line x1={PX} y1={PY} x2={PX} y2={130} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
      <line x1={PX-32} y1={130} x2={PX+32} y2={130} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
      <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#4a4a4a" strokeWidth="2.5" strokeLinecap="round" style={{ transition: tr }} />
      <circle cx={PX} cy={PY} r={5} fill="#555" />
      {[{ x: lx, y: ly }, { x: rx, y: ry }].map((p, i) => (
        <>
          <line key={`sl${i}`} x1={p.x-15} y1={p.y+17} x2={p.x} y2={p.y} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: tr }} />
          <line key={`sr${i}`} x1={p.x+15} y1={p.y+17} x2={p.x} y2={p.y} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: tr }} />
        </>
      ))}
      <path d={`M${lx-PAN_R},${ly+17} Q${lx},${ly+17+PAN_DEPTH} ${lx+PAN_R},${ly+17}`} stroke={lColor} strokeWidth="2" fill="none" style={{ transition: tr }} />
      <path d={`M${rx-PAN_R},${ry+17} Q${rx},${ry+17+PAN_DEPTH} ${rx+PAN_R},${ry+17}`} stroke={rColor} strokeWidth="2" fill="none" style={{ transition: tr }} />
      <text x={lx} y={ly+17+PAN_DEPTH+15} textAnchor="middle" fill={lColor} fontSize="13" fontWeight="700" fontFamily="system-ui" style={{ transition: "all 0.9s" }}>{leftPct.toFixed(1)}%</text>
      <text x={rx} y={ry+17+PAN_DEPTH+15} textAnchor="middle" fill={rColor} fontSize="13" fontWeight="700" fontFamily="system-ui" style={{ transition: "all 0.9s" }}>{rightPct.toFixed(1)}%</text>
    </svg>
  );
}

// ── Distribution chart ────────────────────────────────────────────────────────
const CHART_W = 380, CHART_H = 88;

function DistributionChart({ scores, playerScore }: { scores: number[]; playerScore: number }) {
  const below = scores.filter(s => s < playerScore).length;
  const topPct = Math.max(1, Math.round((1 - below / scores.length) * 100));
  const playerX = scores.length > 1 ? (below / scores.length) * CHART_W : CHART_W / 2;

  const STEPS = 120, PAD_TOP = 10, usableH = CHART_H - PAD_TOP - 10;
  const gaussian = (t: number) => Math.exp(-((t - 0.5) ** 2) / (2 * 0.2 ** 2));
  const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    return { x: t * CHART_W, y: PAD_TOP + usableH * (1 - gaussian(t) * 0.95) };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;

  return (
    <div className={styles.chartWrap}>
      <div className={styles.percentileRow}>
        <span className={styles.percentileValue}>Top {topPct}%</span>
        <span className={styles.percentileLabel}>of {scores.length} players today</span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className={styles.chartSvg} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8f04a" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#b8f04a" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="clipLeft"><rect x="0" y="0" width={playerX} height={CHART_H} /></clipPath>
          <clipPath id="clipRight"><rect x={playerX} y="0" width={CHART_W - playerX} height={CHART_H} /></clipPath>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#clipLeft)" />
        <path d={areaPath} fill="rgba(184,240,74,0.12)" clipPath="url(#clipRight)" />
        <path d={linePath} fill="none" stroke="#555" strokeWidth="1.5" />
        <line x1={playerX} y1={0} x2={playerX} y2={CHART_H} stroke="#b8f04a" strokeWidth="1.5" strokeDasharray="4 3" />
        <rect x={Math.min(playerX - 16, CHART_W - 36)} y={1} width={32} height={14} rx={4} fill="#b8f04a" />
        <text x={Math.min(playerX, CHART_W - 20)} y={11} textAnchor="middle" fill="#0a0a0a" fontSize="8" fontWeight="700" fontFamily="system-ui">YOU</text>
        {(["Worst", "Best"] as const).map((label, i) => (
          <text key={label} x={i === 0 ? 4 : CHART_W - 4} y={CHART_H - 1} textAnchor={i === 0 ? "start" : "end"} fill="#444" fontSize="7" fontFamily="system-ui">{label}</text>
        ))}
      </svg>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`${styles.toast} ${visible ? styles.toastVisible : ""}`} role="alert">
      <span className={styles.toastIcon}>✂️</span>
      {message}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Phase = "idle" | "cut" | "scored";

export default function PlayPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cutResult, setCutResult] = useState<CutResult | null>(null);
  const [scaleVisible, setScaleVisible] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [invalidCut, setInvalidCut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const handleCut = useCallback((result: CutResult) => {
    setCutResult(result);
    setPhase("cut");
    setTimeout(() => setScaleVisible(true), 200);
    setTimeout(async () => {
      const s = calcScore(result.leftVolumePct);
      setFinalScore(s);
      setPhase("scored");
      setStatsLoading(true);
      await saveResult(1, result.leftVolumePct, result.rightVolumePct, s);
      const stats = await fetchDayStats(1);
      setDayStats(stats);
      setStatsLoading(false);
    }, 1500);
  }, []);

  const handleInvalidCut = useCallback(() => {
    setInvalidCut(true);
    setTimeout(() => setInvalidCut(false), 900);
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setCutResult(null);
    setScaleVisible(false);
    setFinalScore(null);
    setInvalidCut(false);
    setCopied(false);
    setDayStats(null);
    setStatsLoading(false);
  }, []);

  const handleShare = useCallback(() => {
    if (!cutResult || finalScore === null) return;
    const text = buildShareText(1, cutResult.leftVolumePct, cutResult.rightVolumePct, finalScore);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [cutResult, finalScore]);

  return (
    <div className={styles.page}>
      <Toast message="Cut must cross the apple" visible={invalidCut} />

      <header className={styles.header}>
        <Link href="/" className={styles.backBtn}>← Back</Link>
        <span className={styles.dayLabel}>Day #1 · Apple</span>
        <div />
      </header>

      <main className={`${styles.main} ${finalScore !== null ? styles.mainScored : ""}`}>
        <div className={styles.inner}>

          {/* ── Game column ── */}
          <div className={styles.gameCol}>
            <div className={styles.instructionWrap}>
              <p className={`${styles.instruction} ${phase === "idle" ? styles.show : ""}`}>
                ✂️ Click and drag to cut
              </p>
              <p className={`${styles.instruction} ${phase === "cut" || phase === "scored" ? styles.show : ""}`}>
                Weighing the halves…
              </p>
            </div>

            <div className={styles.svgWrap}>
              <AppleScene
                phase={phase}
                onCut={handleCut}
                onInvalidCut={handleInvalidCut}
              />
            </div>
          </div>

          {/* ── Results column ── */}
          <div className={styles.resultsCol}>
            {finalScore !== null && cutResult && (
              <>
                <div className={styles.scoreScaleRow}>
                  <div className={styles.scorePanel}>
                    <div className={styles.scoreTop}>
                      <span className={styles.scoreNumber}>{finalScore}</span>
                      <span className={styles.scoreMax}>&nbsp;/ 1000</span>
                    </div>
                    <p className={styles.scoreTag}>{scoreLabel(finalScore)}</p>
                    <p className={styles.splitDetail}>
                      {cutResult.leftVolumePct.toFixed(2)}%&nbsp;&nbsp;·&nbsp;&nbsp;{cutResult.rightVolumePct.toFixed(2)}%
                    </p>
                    <div className={styles.actionRow}>
                      <button className={styles.shareBtn} onClick={handleShare}>
                        {copied ? "✓ Copied!" : "Share result"}
                      </button>
                      <button className={styles.retryBtn} onClick={reset}>
                        Try again
                      </button>
                    </div>
                  </div>
                  <BalanceScale
                    leftPct={cutResult.leftVolumePct}
                    rightPct={cutResult.rightVolumePct}
                    visible={scaleVisible}
                  />
                </div>

                <div className={styles.statsPanel}>
                  {statsLoading ? (
                    <p className={styles.statsLoading}>Loading stats…</p>
                  ) : dayStats ? (
                    <>
                      <DistributionChart scores={dayStats.scores} playerScore={finalScore} />
                      <div className={styles.statsRow}>
                        <div className={styles.statCard}>
                          <span className={styles.statValue}>{dayStats.totalPlays}</span>
                          <span className={styles.statLabel}>Players</span>
                        </div>
                        <div className={styles.statCard}>
                          <span className={styles.statValue}>{dayStats.avgScore}</span>
                          <span className={styles.statLabel}>Avg score</span>
                        </div>
                        <div className={styles.statCard}>
                          <span className={styles.statValue}>{dayStats.avgLeftPct.toFixed(1)}%</span>
                          <span className={styles.statLabel}>Avg cut</span>
                        </div>
                        <div className={styles.statCard}>
                          <span className={styles.statValue}>{dayStats.bestLeftPct.toFixed(1)}%</span>
                          <span className={styles.statLabel}>Best cut</span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
