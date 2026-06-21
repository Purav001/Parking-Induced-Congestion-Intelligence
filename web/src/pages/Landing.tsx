import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useData } from "../lib/data";
import { fmt } from "../lib/format";
import { CountUp, SectionTitle } from "../components/ui";
import HeroBackdrop from "../components/HeroBackdrop";

const HEAD_1 = "See the congestion".split(" ");
const HEAD_2 = "before it chokes the city.".split(" ");

const wordV = {
  hidden: { opacity: 0, y: 28, rotateX: -40 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { delay: 0.1 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Landing() {
  const { data, error } = useData();
  const k = data?.summary.kpis;
  const bt = data?.forecast.backtest.station;
  const conc = data?.summary.impact_concentration.top_10pct_cells_impact_share;

  const stats = [
    { to: k?.total_violations ?? 0, suffix: "", l: "Violations analysed", c: "#4cc9f0" },
    { to: k?.hotspot_zones ?? 0, suffix: "", l: "Hotspot zones", c: "#ffd166", raw: true },
    { to: conc ?? 0, suffix: "%", l: "Impact in 10% of area", c: "#ff9f1c", dec: 1 },
    { to: bt ? Math.round(bt.recall_at_20 * 100) : 0, suffix: "%", l: "Forecast recall@20", c: "#4cc9a0", raw: true },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* ---------- HERO ---------- */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-5 pb-20 pt-20">
        <HeroBackdrop />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 mb-6 flex justify-center"
        >
          <span className="chip border-accent/40 bg-accent/10 text-accent backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-low animate-pulseDot" />
            Flipkart GRID · Parking-Induced Congestion Intelligence
          </span>
        </motion.div>

        {/* word-reveal headline */}
        <h1
          className="relative z-10 mx-auto max-w-4xl text-center text-5xl font-black leading-[1.05] tracking-tight md:text-7xl"
          style={{ perspective: 800 }}
        >
          <span className="inline-block">
            {HEAD_1.map((w, i) => (
              <motion.span
                key={i}
                custom={i}
                initial="hidden"
                animate="show"
                variants={wordV}
                className="mr-[0.25em] inline-block"
              >
                {w}
              </motion.span>
            ))}
          </span>
          <br />
          <span className="inline-block">
            {HEAD_2.map((w, i) => (
              <motion.span
                key={i}
                custom={HEAD_1.length + i}
                initial="hidden"
                animate="show"
                variants={wordV}
                className="mr-[0.25em] inline-block gradient-text"
              >
                {w}
              </motion.span>
            ))}
          </span>
        </h1>

        {/* CSS-driven reveals (reliable, snappy) — staggered after the headline */}
        <p
          className="fade-up relative z-10 mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-muted md:text-lg"
          style={{ animationDelay: "0.45s" }}
        >
          GRID turns a raw police parking-violation log into an AI-driven decision tool — it finds
          the hotspots that actually choke traffic, ranks them for enforcement, and forecasts where
          to send patrols next.
        </p>

        {error && (
          <div className="relative z-10 mx-auto mt-5 max-w-md rounded-lg border border-high/40 bg-high/10 px-4 py-2 text-center text-xs text-high">
            Live data unavailable — showing the experience shell. Run the pipeline to populate stats.
          </div>
        )}

        <div
          className="fade-up relative z-10 mt-9 flex flex-wrap justify-center gap-3"
          style={{ animationDelay: "0.6s" }}
        >
          <Link
            to="/dashboard"
            className="group relative overflow-hidden rounded-xl bg-accent px-6 py-3 font-bold text-bg shadow-glow-accent transition-transform hover:scale-[1.04]"
          >
            <span className="relative z-10">Explore the map →</span>
            <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-500 group-hover:translate-x-full" />
          </Link>
          <Link
            to="/forecast"
            className="rounded-xl border border-border bg-panel2/70 px-6 py-3 font-bold text-ink backdrop-blur-sm transition-colors hover:border-accent"
          >
            See the patrol forecast
          </Link>
        </div>

        {/* live stat ribbon with count-up */}
        <div
          className="fade-up relative z-10 mt-14 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-4"
          style={{ animationDelay: "0.75s" }}
        >
          {stats.map((s) => (
            <div key={s.l} className="glass-soft px-4 py-4 text-center backdrop-blur-md">
              <div className="text-3xl font-black md:text-4xl" style={{ color: s.c }}>
                {data ? (
                  <CountUp to={s.to} suffix={s.suffix} decimals={s.dec ?? 0} />
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">{s.l}</div>
            </div>
          ))}
        </div>

        {/* scroll cue */}
        <motion.div
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-muted2"
          animate={{ y: [0, 8, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.div>
      </section>

      {/* ---------- PROBLEM ---------- */}
      <section className="relative mx-auto max-w-[1400px] px-5 py-14">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionTitle
            kicker="The Problem"
            title="Enforcement today is reactive and blind"
            sub="On-street and spillover parking near commercial areas, metro stations and events chokes carriageways — but cities can't see which violations actually hurt traffic, or where to act first."
          />
        </motion.div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Reactive", d: "Patrol-based — officers only act on what they happen to see.", c: "#ff4d5e" },
            { t: "No impact view", d: "No heatmap of violations vs. their real congestion impact.", c: "#ff9f1c" },
            { t: "No prioritisation", d: "Impossible to know which enforcement zones matter most.", c: "#ffd166" },
          ].map((p, i) => (
            <motion.div
              key={p.t}
              className="glass relative overflow-hidden p-6"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -5 }}
            >
              <span className="absolute left-0 top-0 h-1 w-full" style={{ background: p.c }} />
              <div className="text-xl font-bold" style={{ color: p.c }}>
                {p.t}
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{p.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- JOURNEY (animated vertical, alternating sides) ---------- */}
      <section className="relative border-y border-borderSoft bg-bg2/40 py-16">
        <div className="mx-auto max-w-[1100px] px-5">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <SectionTitle
              kicker="From data to decision"
              title="One log in, a patrol plan out"
              sub="A deterministic pipeline — no black box. Follow the journey from a raw ticket to a ranked patrol plan."
            />
          </motion.div>
          <Journey />
        </div>
      </section>

      {/* ---------- HOW ---------- */}
      <section className="relative mx-auto max-w-[1400px] px-5 py-14">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionTitle
            kicker="How GRID works"
            title="Two intelligence layers, one decision loop"
            sub="The rear-view mirror tells you what happened. The windshield tells you what to do next."
          />
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2">
          <FeatureCard
            color="#4cc9f0"
            tag="Layer 1 · rear-view"
            title="Congestion Intelligence"
            points={[
              "Congestion Impact Score per violation",
              `${k?.hotspot_zones ?? "—"} ranked hotspot zones + heatmap`,
              "Drop a pin → exact analytics for any area",
              "Critical → Low enforcement worklist",
            ]}
            to="/dashboard"
            cta="Open the dashboard"
          />
          <FeatureCard
            color="#4cc9a0"
            tag="Layer 2 · windshield"
            title="Patrol Forecast"
            points={[
              "Recency-weighted risk + trend per zone",
              "Weekly patrol roster (cadence by tier)",
              `Validated: top-20 capture ${bt ? Math.round(bt.recall_at_20 * 100) : "—"}% of next fortnight`,
              "Honest scope: predicts where, not the exact hour",
            ]}
            to="/forecast"
            cta="See the forecast"
          />
        </div>
      </section>

      {/* ---------- CLOSING CTA ---------- */}
      <section className="relative mx-auto max-w-[1400px] px-5 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass relative overflow-hidden px-8 py-14 text-center"
        >
          <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
          <div className="relative z-10">
            <h2 className="mx-auto max-w-2xl text-3xl font-black tracking-tight md:text-4xl">
              Turn {k ? fmt(k.total_violations) : "248k"} scattered tickets into a{" "}
              <span className="gradient-text">targeted patrol plan.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted md:text-base">
              Explore the live map, drop a pin on any neighbourhood, and see exactly where
              enforcement should go next.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/dashboard"
                className="group relative overflow-hidden rounded-xl bg-accent px-7 py-3 font-bold text-bg shadow-glow-accent transition-transform hover:scale-[1.04]"
              >
                <span className="relative z-10">Launch the dashboard →</span>
                <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-500 group-hover:translate-x-full" />
              </Link>
              <Link
                to="/insights"
                className="rounded-xl border border-border bg-panel2/70 px-7 py-3 font-bold text-ink transition-colors hover:border-accent"
              >
                View city insights
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="relative border-t border-borderSoft py-8 text-center text-xs text-muted2">
        GRID · Parking-Induced Congestion Intelligence — built on{" "}
        {k ? fmt(k.total_violations) : "248k"} anonymized Bengaluru police violations
        (Nov 2023 – Apr 2024).
      </footer>
    </div>
  );
}

function FeatureCard({
  color,
  tag,
  title,
  points,
  to,
  cta,
}: {
  color: string;
  tag: string;
  title: string;
  points: string[];
  to: string;
  cta: string;
}) {
  return (
    <motion.div
      className="glass relative overflow-hidden p-7"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55 }}
      whileHover={{ y: -5 }}
    >
      <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: color }} />
      <div className="text-xs font-bold uppercase tracking-widest" style={{ color }}>
        {tag}
      </div>
      <h3 className="mt-1 text-2xl font-extrabold">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-muted">
            <span style={{ color }} className="font-bold">
              ▸
            </span>
            {p}
          </li>
        ))}
      </ul>
      <Link
        to={to}
        className="mt-6 inline-block text-sm font-bold transition-colors hover:underline"
        style={{ color }}
      >
        {cta} →
      </Link>
    </motion.div>
  );
}

const JOURNEY_STEPS = [
  {
    n: "01",
    t: "Score every violation",
    d: "Each ticket is weighted by severity × vehicle size × time-of-day × junction proximity → a Congestion Impact Score that reflects real traffic damage, not raw counts.",
    c: "#4cc9f0",
    icon: "🚗",
  },
  {
    n: "02",
    t: "Cluster into zones",
    d: "Snap every violation to a 110 m grid, then group the hottest cells into compact, patrollable hotspot zones — tight enough to actually dispatch a unit.",
    c: "#7b5cff",
    icon: "🗺️",
  },
  {
    n: "03",
    t: "Rank for enforcement",
    d: "Blend impact, persistence and recency into a 0–100 priority score, bucketed Critical → Low. The result is a ranked worklist of where to act first.",
    c: "#ff9f1c",
    icon: "📋",
  },
  {
    n: "04",
    t: "Forecast next week",
    d: "Project recency-weighted risk and trend forward into a patrol roster — validated on held-out data so the plan is trustworthy, not a guess.",
    c: "#4cc9a0",
    icon: "🛰️",
  },
];

function Journey() {
  return (
    <div className="relative mt-4">
      {/* center spine */}
      <div className="absolute left-[27px] top-2 bottom-2 w-px bg-borderSoft md:left-1/2 md:-translate-x-1/2" />
      <motion.div
        className="absolute left-[27px] top-2 w-px origin-top bg-gradient-to-b from-accent via-accent2 to-low md:left-1/2 md:-translate-x-1/2"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true, margin: "-20%" }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
        style={{ bottom: 8 }}
      />

      <div className="space-y-8 md:space-y-2">
        {JOURNEY_STEPS.map((s, i) => {
          const left = i % 2 === 0; // alternate sides on desktop
          return (
            <div
              key={s.n}
              className={`relative flex items-center gap-5 md:gap-0 ${
                left ? "md:flex-row" : "md:flex-row-reverse"
              }`}
            >
              {/* node */}
              <motion.div
                className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-2xl md:absolute md:left-1/2 md:-translate-x-1/2"
                style={{ borderColor: `${s.c}66`, background: `${s.c}1a` }}
                initial={{ scale: 0, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              >
                <span>{s.icon}</span>
                <span
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full text-[9px] font-black text-bg"
                  style={{ background: s.c }}
                >
                  {s.n}
                </span>
              </motion.div>

              {/* card */}
              <motion.div
                className={`w-full md:w-[calc(50%-3rem)] ${left ? "md:pr-10 md:text-right" : "md:pl-10"}`}
                initial={{ opacity: 0, x: left ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="glass p-5 transition-shadow hover:shadow-card">
                  <h3 className="text-lg font-bold" style={{ color: s.c }}>
                    {s.t}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
                </div>
              </motion.div>

              {/* spacer for the empty half on desktop */}
              <div className="hidden md:block md:w-[calc(50%-3rem)]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
