"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { saveResult, fetchDayStats, type DayStats } from "@/lib/supabase";

// ── SVG canvas ───────────────────────────────────────────────────────────────
const W = 440;
const H = 440;
const CX = W / 2;
const CY = H / 2;
const R = 155;
const SPLIT_PX = 30; // how far each half slides apart

// ── Geometry ─────────────────────────────────────────────────────────────────
function toSVG(el: SVGSVGElement, cx: number, cy: number) {
  const rect = el.getBoundingClientRect();
  return {
    x: ((cx - rect.left) / rect.width) * W,
    y: ((cy - rect.top) / rect.height) * H,
  };
}

function perpDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs((py - y1) * dx - (px - x1) * dy) / len;
}

function signedDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return ((py - y1) * dx - (px - x1) * dy) / len;
}

interface SplitData {
  leftPct: number;
  rightPct: number;
  leftDx: number;
  leftDy: number;
  rightDx: number;
  rightDy: number;
}

function computeSplit(
  x1: number, y1: number,
  x2: number, y2: number,
): SplitData | null {
  const d = perpDist(CX, CY, x1, y1, x2, y2);
  if (d >= R) return null;

  const theta = Math.acos(Math.min(d / R, 1));
  const segArea = R * R * theta - d * Math.sqrt(Math.max(0, R * R - d * d));
  const totalArea = Math.PI * R * R;
  const smallPct = (segArea / totalArea) * 100;

  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);

  // perpendicular unit vectors scaled to SPLIT_PX
  const lDx = (-dy / len) * SPLIT_PX;
  const lDy = (dx / len) * SPLIT_PX;
  const rDx = (dy / len) * SPLIT_PX;
  const rDy = (-dx / len) * SPLIT_PX;

  // sign > 0 → circle center is on the "left" side of the line → larger half is left
  const sign = signedDist(CX, CY, x1, y1, x2, y2);
  return sign >= 0
    ? { leftPct: 100 - smallPct, rightPct: smallPct, leftDx: lDx, leftDy: lDy, rightDx: rDx, rightDy: rDy }
    : { leftPct: smallPct, rightPct: 100 - smallPct, leftDx: lDx, leftDy: lDy, rightDx: rDx, rightDy: rDy };
}

// Half-plane clip polygon (large quadrilateral covering one side of the line)
function clipPolygon(
  x1: number, y1: number,
  x2: number, y2: number,
  side: "left" | "right",
) {
  const BIG = 4000;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const px = side === "left" ? (-dy / len) * BIG : (dy / len) * BIG;
  const py = side === "left" ? (dx / len) * BIG : (-dx / len) * BIG;
  const ex = (dx / len) * BIG, ey = (dy / len) * BIG;
  return [
    `${x1 - ex},${y1 - ey}`,
    `${x2 + ex},${y2 + ey}`,
    `${x2 + ex + px},${y2 + ey + py}`,
    `${x1 - ex + px},${y1 - ey + py}`,
  ].join(" ");
}

// Score: linear 1000→0 based on deviation from 50%
function calcScore(pct: number) {
  const diff = Math.abs(50 - pct);
  return Math.max(0, Math.round(1000 * (1 - diff / 50)));
}

function scoreLabel(s: number) {
  if (s >= 995) return "🎯 Unbelievable!";
  if (s >= 950) return "🔥 Perfect cut!";
  if (s >= 850) return "✂️ Clean slice!";
  if (s >= 650) return "👍 Pretty good!";
  if (s >= 400) return "😬 Off balance…";
  return "💀 Back to cooking school";
}

function buildShareText(
  day: number,
  leftPct: number,
  rightPct: number,
  score: number,
): string {
  const block =
    score >= 950 ? "🟩" :
    score >= 750 ? "🟨" :
    score >= 500 ? "🟧" :
    "🟥";

  const leftBlocks = Math.round(leftPct / 10);
  const rightBlocks = 10 - leftBlocks;
  const bar = block.repeat(leftBlocks) + "✂️" + block.repeat(rightBlocks);

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

// ── Apple cross-section SVG ───────────────────────────────────────────────────
function Apple() {
  const seeds: [number, number, number][] = [
    [-0.17, -0.13, -20],
    [0.17, -0.13, 20],
    [-0.21, 0.1, -15],
    [0.21, 0.1, 15],
    [0, 0.23, 0],
  ];
  // radial lines from core to flesh (like apple segments)
  const segmentAngles = [0, 72, 144, 216, 288];

  return (
    <>
      {/* Skin */}
      <circle cx={CX} cy={CY} r={R} fill="#bf4730" />
      {/* Flesh */}
      <circle cx={CX} cy={CY} r={R - 11} fill="#f2e6be" />
      {/* Segment lines */}
      {segmentAngles.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.round(Math.cos(rad) * 1e4) / 1e4;
        const sin = Math.round(Math.sin(rad) * 1e4) / 1e4;
        return (
          <line
            key={i}
            x1={CX + cos * R * 0.19}
            y1={CY + sin * R * 0.19}
            x2={CX + cos * R * 0.62}
            y2={CY + sin * R * 0.62}
            stroke="#d4b07a"
            strokeWidth="1.5"
            opacity="0.35"
          />
        );
      })}
      {/* Core */}
      <ellipse cx={CX} cy={CY} rx={R * 0.19} ry={R * 0.15} fill="#d4b07a" opacity="0.85" />
      {/* Seeds */}
      {seeds.map(([ox, oy, rot], i) => (
        <ellipse
          key={i}
          cx={CX + R * ox}
          cy={CY + R * oy}
          rx={R * 0.038}
          ry={R * 0.072}
          fill="#3a1608"
          transform={`rotate(${rot} ${CX + R * ox} ${CY + R * oy})`}
        />
      ))}
      {/* Highlight */}
      <ellipse
        cx={CX - R * 0.26}
        cy={CY - R * 0.26}
        rx={R * 0.13}
        ry={R * 0.08}
        fill="white"
        opacity="0.06"
        transform={`rotate(-35 ${CX} ${CY})`}
      />
    </>
  );
}

// ── Balance scale ─────────────────────────────────────────────────────────────
function BalanceScale({ leftPct, rightPct, visible }: {
  leftPct: number;
  rightPct: number;
  visible: boolean;
}) {
  const ARM = 78;
  const PX = 130, PY = 56; // shifted down to give room when arm swings up
  const PAN_R = 22;
  const PAN_DEPTH = 12;

  // tilt: positive = left drops (left is heavier)
  const rawTilt = (leftPct - 50) * 1.4;
  const tilt = Math.max(-38, Math.min(38, rawTilt));
  const rad = (tilt * Math.PI) / 180;

  const lx = PX - ARM * Math.cos(rad);
  const ly = PY + ARM * Math.sin(rad);
  const rx = PX + ARM * Math.cos(rad);
  const ry = PY - ARM * Math.sin(rad);

  const lColor = leftPct > rightPct ? "var(--accent)" : "#f5f5f5";
  const rColor = rightPct > leftPct ? "var(--accent)" : "#f5f5f5";

  return (
    <svg
      width="260" height="160"
      viewBox="0 0 260 160"
      className={`${styles.scale} ${visible ? styles.scaleVisible : ""}`}
    >
      {/* Stand */}
      <line x1={PX} y1={PY} x2={PX} y2={130} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
      <line x1={PX - 32} y1={130} x2={PX + 32} y2={130} stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />

      {/* Beam */}
      <line
        x1={lx} y1={ly} x2={rx} y2={ry}
        stroke="#4a4a4a"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}
      />
      <circle cx={PX} cy={PY} r={5} fill="#555" />

      {/* Strings – left */}
      <line x1={lx - 15} y1={ly + 17} x2={lx} y2={ly} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }} />
      <line x1={lx + 15} y1={ly + 17} x2={lx} y2={ly} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }} />
      {/* Strings – right */}
      <line x1={rx - 15} y1={ry + 17} x2={rx} y2={ry} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }} />
      <line x1={rx + 15} y1={ry + 17} x2={rx} y2={ry} stroke="#4a4a4a" strokeWidth="1.5" style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }} />

      {/* Pans */}
      <path
        d={`M${lx - PAN_R},${ly + 17} Q${lx},${ly + 17 + PAN_DEPTH} ${lx + PAN_R},${ly + 17}`}
        stroke={lColor} strokeWidth="2" fill="none"
        style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}
      />
      <path
        d={`M${rx - PAN_R},${ry + 17} Q${rx},${ry + 17 + PAN_DEPTH} ${rx + PAN_R},${ry + 17}`}
        stroke={rColor} strokeWidth="2" fill="none"
        style={{ transition: visible ? "all 0.9s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}
      />

      {/* Percentages */}
      <text
        x={lx} y={ly + 17 + PAN_DEPTH + 15}
        textAnchor="middle" fill={lColor}
        fontSize="13" fontWeight="700" fontFamily="system-ui"
        style={{ transition: visible ? "all 0.9s" : "none" }}
      >
        {leftPct.toFixed(1)}%
      </text>
      <text
        x={rx} y={ry + 17 + PAN_DEPTH + 15}
        textAnchor="middle" fill={rColor}
        fontSize="13" fontWeight="700" fontFamily="system-ui"
        style={{ transition: visible ? "all 0.9s" : "none" }}
      >
        {rightPct.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── Distribution chart ────────────────────────────────────────────────────────
const CHART_W = 380;
const CHART_H = 88;
const BUCKETS = 20;
const BUCKET_SIZE = 1000 / BUCKETS; // 50 pts each

function catmullRom(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const get = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  let d = `M ${get(0).x.toFixed(1)},${get(0).y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function DistributionChart({
  scores,
  playerScore,
}: {
  scores: number[];
  playerScore: number;
}) {
  const counts = Array.from<number>({ length: BUCKETS }).fill(0) as number[];
  for (const s of scores) {
    const idx = Math.min(BUCKETS - 1, Math.floor(s / BUCKET_SIZE));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  const maxCount = Math.max(...counts, 1);
  const barW = CHART_W / BUCKETS;
  const PAD_TOP = 12;
  const usableH = CHART_H - PAD_TOP;

  // Points at the top-centre of each bar for the smooth curve
  const curvePts = counts.map((c, i) => ({
    x: (i + 0.5) * barW,
    y: PAD_TOP + usableH - (c / maxCount) * usableH * 0.92,
  }));

  const linePath = catmullRom(curvePts);
  const areaPath =
    linePath +
    ` L ${CHART_W},${CHART_H} L 0,${CHART_H} Z`;

  const playerX = (playerScore / 1000) * CHART_W;
  const playerBucket = Math.min(BUCKETS - 1, Math.floor(playerScore / BUCKET_SIZE));

  // percentile: fraction of scores strictly below the player
  const below = scores.filter((s) => s < playerScore).length;
  const topPct = Math.max(1, Math.round((1 - below / scores.length) * 100));

  return (
    <div className={styles.chartWrap}>
      {/* Percentile headline */}
      <div className={styles.percentileRow}>
        <span className={styles.percentileValue}>Top {topPct}%</span>
        <span className={styles.percentileLabel}>of {scores.length} players today</span>
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className={styles.chartSvg}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8f04a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#b8f04a" stopOpacity="0.02" />
          </linearGradient>
          {/* Clip left of player */}
          <clipPath id="clipLeft">
            <rect x="0" y="0" width={playerX} height={CHART_H} />
          </clipPath>
          {/* Clip right of player */}
          <clipPath id="clipRight">
            <rect x={playerX} y="0" width={CHART_W - playerX} height={CHART_H} />
          </clipPath>
        </defs>

        {/* Bars */}
        {counts.map((c, i) => {
          const h = (c / maxCount) * usableH * 0.92;
          const isPlayer = i === playerBucket;
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={PAD_TOP + usableH - h}
              width={barW - 2}
              height={h}
              rx="2"
              fill={isPlayer ? "rgba(184,240,74,0.35)" : "#1e1e1e"}
            />
          );
        })}

        {/* Filled area — muted left, accent right of player */}
        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#clipLeft)" />
        <path d={areaPath} fill="rgba(184,240,74,0.10)" clipPath="url(#clipRight)" />

        {/* Smooth curve line */}
        <path d={linePath} fill="none" stroke="#444" strokeWidth="1.5" />

        {/* Player vertical line */}
        <line
          x1={playerX} y1={0}
          x2={playerX} y2={CHART_H}
          stroke="#b8f04a"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* "You" label */}
        <rect
          x={Math.min(playerX - 16, CHART_W - 36)}
          y={1} width={32} height={14} rx={4}
          fill="#b8f04a"
        />
        <text
          x={Math.min(playerX, CHART_W - 20)}
          y={11}
          textAnchor="middle"
          fill="#0a0a0a"
          fontSize="8"
          fontWeight="700"
          fontFamily="system-ui"
        >
          YOU
        </text>

        {/* X-axis labels */}
        {[0, 250, 500, 750, 1000].map((v) => (
          <text
            key={v}
            x={(v / 1000) * CHART_W}
            y={CHART_H - 1}
            textAnchor="middle"
            fill="#555"
            fontSize="7"
            fontFamily="system-ui"
          >
            {v}
          </text>
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

// ── Main game component ───────────────────────────────────────────────────────
type Phase = "idle" | "drawing" | "cut" | "scored";

export default function PlayPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [cut, setCut] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [split, setSplit] = useState<SplitData | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [invalidCut, setInvalidCut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dayStats, setDayStats] = useState<DayStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const handleShare = useCallback(() => {
    if (!split || finalScore === null) return;
    const text = buildShareText(1, split.leftPct, split.rightPct, finalScore);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [split, finalScore]);

  const reset = useCallback(() => {
    setPhase("idle");
    setCut(null);
    setSplit(null);
    setSplitting(false);
    setFinalScore(null);
    setDrawStart(null);
    setDrawCurrent(null);
    setInvalidCut(false);
    setDayStats(null);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (phase !== "idle") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = toSVG(svgRef.current!, e.clientX, e.clientY);
    setDrawStart(pos);
    setDrawCurrent(pos);
    setPhase("drawing");
  }, [phase]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (phase !== "drawing") return;
    setDrawCurrent(toSVG(svgRef.current!, e.clientX, e.clientY));
  }, [phase]);

  const onPointerUp = useCallback(() => {
    if (phase !== "drawing" || !drawStart || !drawCurrent) return;

    const tooShort = Math.hypot(
      drawCurrent.x - drawStart.x,
      drawCurrent.y - drawStart.y,
    ) < 20;
    if (tooShort) { reset(); return; }

    const result = computeSplit(drawStart.x, drawStart.y, drawCurrent.x, drawCurrent.y);
    if (!result) {
      setInvalidCut(true);
      setTimeout(() => { setInvalidCut(false); reset(); }, 900);
      return;
    }

    setCut({ x1: drawStart.x, y1: drawStart.y, x2: drawCurrent.x, y2: drawCurrent.y });
    setSplit(result);
    setPhase("cut");

    // small delay so first render draws halves in place, then animate apart
    setTimeout(() => setSplitting(true), 80);
    setTimeout(async () => {
      const s = calcScore(result.leftPct);
      setFinalScore(s);
      setPhase("scored");

      // save result then fetch updated stats
      setStatsLoading(true);
      await saveResult(1, result.leftPct, result.rightPct, s);
      const stats = await fetchDayStats(1);
      setDayStats(stats);
      setStatsLoading(false);
    }, 1500);
  }, [phase, drawStart, drawCurrent, reset]);

  const previewLine = phase === "drawing" && drawStart && drawCurrent
    ? { x1: drawStart.x, y1: drawStart.y, x2: drawCurrent.x, y2: drawCurrent.y }
    : null;

  return (
    <div className={styles.page}>

      <Toast message="Cut must cross the apple" visible={invalidCut} />

      {/* Header */}
      <header className={styles.header}>
        <Link href="/" className={styles.backBtn}>← Back</Link>
        <span className={styles.dayLabel}>Day #1 · Apple</span>
        <div />
      </header>

      <main className={`${styles.main} ${finalScore !== null ? styles.mainScored : ""}`}>

        {/* ── Left column: game ── */}
        <div className={styles.gameCol}>

        {/* Instruction */}
        <div className={styles.instructionWrap}>
          <p className={`${styles.instruction} ${phase === "idle" ? styles.show : ""}`}>
            ✂️ Click and drag to cut
          </p>
          <p className={`${styles.instruction} ${phase === "drawing" ? styles.show : ""}`}>
            Release to make the cut
          </p>
          <p className={`${styles.instruction} ${phase === "cut" || phase === "scored" ? styles.show : ""}`}>
            Weighing the halves…
          </p>
        </div>

        {/* Game SVG */}
        <div className={styles.svgWrap}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`${styles.gameSvg} ${phase === "idle" || phase === "drawing" ? styles.cursorCut : ""}`}
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <defs>
              {cut && (
                <>
                  <clipPath id="clip-l">
                    <polygon points={clipPolygon(cut.x1, cut.y1, cut.x2, cut.y2, "left")} />
                  </clipPath>
                  <clipPath id="clip-r">
                    <polygon points={clipPolygon(cut.x1, cut.y1, cut.x2, cut.y2, "right")} />
                  </clipPath>
                </>
              )}
            </defs>

            {/* Uncut apple */}
            {(phase === "idle" || phase === "drawing") && <Apple />}

            {/* Post-cut halves */}
            {cut && split && (
              <>
                <g
                  clipPath="url(#clip-l)"
                  style={{
                    transform: splitting
                      ? `translate(${split.leftDx}px, ${split.leftDy}px)`
                      : "translate(0,0)",
                    transition: "transform 0.75s cubic-bezier(0.34,1.56,0.64,1)",
                    willChange: "transform",
                  }}
                >
                  <Apple />
                </g>
                <g
                  clipPath="url(#clip-r)"
                  style={{
                    transform: splitting
                      ? `translate(${split.rightDx}px, ${split.rightDy}px)`
                      : "translate(0,0)",
                    transition: "transform 0.75s cubic-bezier(0.64,1.56,0.34,1)",
                    willChange: "transform",
                  }}
                >
                  <Apple />
                </g>

                {/* Cut glow line */}
                <line
                  x1={cut.x1} y1={cut.y1} x2={cut.x2} y2={cut.y2}
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="7 5"
                  opacity="0.5"
                />
              </>
            )}

            {/* Preview line while drawing */}
            {previewLine && (
              <line
                x1={previewLine.x1} y1={previewLine.y1}
                x2={previewLine.x2} y2={previewLine.y2}
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="10 6"
                opacity="0.75"
              />
            )}
          </svg>
        </div>

        {/* Balance scale */}
        {split && (
          <BalanceScale
            leftPct={split.leftPct}
            rightPct={split.rightPct}
            visible={splitting}
          />
        )}

        </div>{/* end gameCol */}

        {/* ── Right column: results ── */}
        <div className={styles.resultsCol}>

          {finalScore !== null && split && (
            <>
              {/* Score */}
              <div className={styles.scorePanel}>
                <div className={styles.scoreTop}>
                  <span className={styles.scoreNumber}>{finalScore}</span>
                  <span className={styles.scoreMax}>&nbsp;/ 1000</span>
                </div>
                <p className={styles.scoreTag}>{scoreLabel(finalScore)}</p>
                <p className={styles.splitDetail}>
                  {split.leftPct.toFixed(2)}%&nbsp;&nbsp;·&nbsp;&nbsp;{split.rightPct.toFixed(2)}%
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

              {/* Stats */}
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

        </div>{/* end resultsCol */}

      </main>
    </div>
  );
}
