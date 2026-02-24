import Link from "next/link";
import styles from "./page.module.css";

const steps = [
  {
    number: "Step 01",
    icon: "🍎",
    title: "An object is revealed",
    desc: "Each day a new object appears — a fruit, a shape, a slice of something real. One object, one chance.",
  },
  {
    number: "Step 02",
    icon: "✂️",
    title: "Draw your cut",
    desc: "Click or drag to place your cut line wherever you think splits the object perfectly in half.",
  },
  {
    number: "Step 03",
    icon: "⚖️",
    title: "Both halves get weighed",
    desc: "The two pieces are measured. You'll see the exact percentage split your cut produced.",
  },
  {
    number: "Step 04",
    icon: "🏆",
    title: "Score by precision",
    desc: "A perfect 50/50 cut earns the maximum score. Every percentage off the mark costs you points.",
  },
];

const scoreBars = [
  { label: "50%", fill: 100, color: "#b8f04a" },
  { label: "47%", fill: 78, color: "#f0c84a" },
  { label: "40%", fill: 44, color: "#f08c4a" },
  { label: "30%", fill: 12, color: "#f04a4a" },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Daily Challenge</span>

          <h1 className={styles.title}>
            Daily
            <span className={styles.titleAccent}>Halve.</span>
          </h1>

          <p className={styles.subtitle}>
            One object. One cut. How close can you get to{" "}
            <strong>exactly 50/50?</strong> A new challenge drops every day.
          </p>

          <div className={styles.ctaGroup}>
            <Link href="/play" className={styles.playBtn}>
              Play today&apos;s cut →
            </Link>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={styles.statValue}>∞</span>
              <span className={styles.statLabel}>Daily objects</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>1</span>
              <span className={styles.statLabel}>Cut per day</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>50%</span>
              <span className={styles.statLabel}>Perfect score</span>
            </div>
          </div>
        </div>

        {/* Animated object visual */}
        <div className={styles.heroVisual}>
          <div className={styles.objectWrapper}>
            <svg
              className={styles.objectSvg}
              viewBox="0 0 320 320"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Left half */}
              <g className={styles.halfLeft} style={{ transformOrigin: "160px 160px" }}>
                <path
                  d="M160 60 C100 60 50 105 50 160 C50 215 100 260 160 260 L160 60 Z"
                  fill="#c84b32"
                  stroke="#1a1a1a"
                  strokeWidth="1.5"
                />
                {/* Flesh left */}
                <path
                  d="M160 68 C104 68 58 109 58 160 C58 211 104 252 160 252 L160 68 Z"
                  fill="#e85d3a"
                />
                {/* Seeds left */}
                <ellipse cx="120" cy="145" rx="5" ry="8" fill="#2d1a0e" opacity="0.7" />
                <ellipse cx="110" cy="170" rx="5" ry="8" fill="#2d1a0e" opacity="0.7" />
              </g>

              {/* Right half */}
              <g className={styles.halfRight} style={{ transformOrigin: "160px 160px" }}>
                <path
                  d="M160 60 C220 60 270 105 270 160 C270 215 220 260 160 260 L160 60 Z"
                  fill="#c84b32"
                  stroke="#1a1a1a"
                  strokeWidth="1.5"
                />
                {/* Flesh right */}
                <path
                  d="M160 68 C216 68 262 109 262 160 C262 211 216 252 160 252 L160 68 Z"
                  fill="#e85d3a"
                />
                {/* Seeds right */}
                <ellipse cx="200" cy="145" rx="5" ry="8" fill="#2d1a0e" opacity="0.7" />
                <ellipse cx="210" cy="170" rx="5" ry="8" fill="#2d1a0e" opacity="0.7" />
              </g>

              {/* Apple stem */}
              <path
                d="M160 60 C160 50 165 40 172 36"
                stroke="#5a3a1a"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* Leaf */}
              <path
                d="M172 36 C178 28 190 32 186 42 C182 50 172 48 172 36 Z"
                fill="#5aab4a"
              />

              {/* Cut / dividing line (animated) */}
              <line
                className={styles.cutLine}
                x1="160"
                y1="42"
                x2="160"
                y2="272"
                stroke={`var(--accent, #b8f04a)`}
                strokeWidth="2.5"
                strokeDasharray="8 5"
                strokeLinecap="round"
              />

              {/* Score labels (fade in after split) */}
              <g className={styles.scoreLabel}>
                <rect x="68" y="152" width="52" height="24" rx="6" fill="rgba(0,0,0,0.6)" />
                <text
                  x="94"
                  y="168"
                  textAnchor="middle"
                  fill="#b8f04a"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                >
                  50%
                </text>
              </g>
              <g className={styles.scoreLabel}>
                <rect x="198" y="152" width="52" height="24" rx="6" fill="rgba(0,0,0,0.6)" />
                <text
                  x="224"
                  y="168"
                  textAnchor="middle"
                  fill="#b8f04a"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="system-ui, sans-serif"
                >
                  50%
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* Scroll cue */}
        <div className={styles.scrollIndicator}>
          <span>How to play</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ── How to Play ── */}
      <section className={styles.howToPlay}>
        <p className={styles.sectionLabel}>How to play</p>
        <h2 className={styles.sectionTitle}>Simple rules, endless precision.</h2>
        <p className={styles.sectionSubtitle}>
          No words, no letters — just geometry and instinct. Here&apos;s everything
          you need to know.
        </p>

        <div className={styles.steps}>
          {steps.map((step) => (
            <div key={step.number} className={styles.step}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div className={styles.stepIcon}>{step.icon}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>

              {/* Score bars only on last step */}
              {step.number === "Step 04" && (
                <div className={styles.scoreBar}>
                  {scoreBars.map((bar) => (
                    <div key={bar.label} className={styles.scoreBarRow}>
                      <span className={styles.scoreBarLabel}>{bar.label}</span>
                      <div className={styles.scoreBarTrack}>
                        <div
                          className={styles.scoreBarFill}
                          style={{ width: `${bar.fill}%`, background: bar.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <div className={styles.bottomCta}>
        <h2 className={styles.bottomCtaTitle}>Ready to make the cut?</h2>
        <p className={styles.bottomCtaSubtitle}>
          Today&apos;s object is waiting. One shot — make it count.
        </p>
        <Link href="/play" className={styles.playBtn}>
          Play today&apos;s cut →
        </Link>
      </div>
    </>
  );
}
