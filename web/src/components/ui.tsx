import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tier, Trend } from "../lib/types";
import { TIER_COLOR } from "../lib/types";

// ---- count-up number (animates from 0 when scrolled into view) ----
export function CountUp({
  to,
  suffix = "",
  decimals = 0,
  duration = 1.4,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const [val, setVal] = useState("0");

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, to, mv]);
  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      setVal(
        decimals > 0
          ? v.toFixed(decimals)
          : v >= 1000
          ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k"
          : Math.round(v).toString(),
      );
    });
    return () => unsub();
  }, [spring, decimals]);

  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  );
}

// ---- motion presets ----
export const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};
export const stagger = {
  animate: { transition: { staggerChildren: 0.07 } },
};
export const item = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

// ---- KPI card ----
export function Kpi({
  value,
  label,
  accent = "#4cc9f0",
  sub,
}: {
  value: string;
  label: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -4 }}
      className="glass-soft relative overflow-hidden px-4 py-3.5"
    >
      <span className="absolute left-0 top-0 h-full w-1" style={{ background: accent, opacity: 0.7 }} />
      <div className="text-2xl font-extrabold leading-tight" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-1 text-[10.5px] uppercase tracking-wide text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted2">{sub}</div>}
    </motion.div>
  );
}

// ---- tier badge ----
export function TierBadge({ tier, suffix }: { tier: Tier; suffix?: string }) {
  const c = TIER_COLOR[tier];
  return (
    <span
      className="chip"
      style={{ color: c, borderColor: `${c}55`, background: `${c}1f` }}
    >
      {tier}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

// ---- trend badge ----
const TREND_ICON: Record<Trend, string> = { Rising: "▲", Cooling: "▼", Steady: "—" };
const TREND_COLOR: Record<Trend, string> = { Rising: "#ff9f1c", Cooling: "#4cc9f0", Steady: "#93a5c4" };
export function TrendBadge({ trend }: { trend: Trend }) {
  const c = TREND_COLOR[trend];
  return (
    <span className="chip" style={{ color: c, borderColor: `${c}55`, background: `${c}1a` }}>
      {TREND_ICON[trend]} {trend}
    </span>
  );
}

// ---- animated horizontal bar row ----
export function BarRow({
  label,
  value,
  max,
  display,
  color = "linear-gradient(90deg,#4cc9f0,#7b5cff)",
  delay = 0,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  color?: string;
  delay?: number;
}) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="mb-2 flex items-center gap-3 text-xs">
      <span className="w-[130px] shrink-0 truncate text-muted" title={label}>
        {label}
      </span>
      <div className="h-3.5 flex-1 overflow-hidden rounded bg-bg2">
        <motion.div
          className="h-full rounded"
          style={{ background: color }}
          initial={{ width: 0 }}
          whileInView={{ width: `${w}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="w-[54px] shrink-0 text-right font-mono text-ink">{display}</span>
    </div>
  );
}

// ---- section title ----
export function SectionTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      {kicker && (
        <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-accent">{kicker}</div>
      )}
      <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

// ---- glow card wrapper ----
export function GlowCard({
  children,
  className = "",
  glow = "accent",
}: {
  children: ReactNode;
  className?: string;
  glow?: "accent" | "violet" | "none";
}) {
  const ring =
    glow === "accent"
      ? "hover:shadow-glow-accent"
      : glow === "violet"
      ? "hover:shadow-glow-violet"
      : "";
  return <div className={`glass p-5 transition-shadow duration-300 ${ring} ${className}`}>{children}</div>;
}

// ---- pill toggle group ----
export function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; dot?: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`chip transition-all ${
              active
                ? "bg-accent text-bg border-accent font-bold"
                : "bg-panel2 text-muted border-borderSoft hover:border-accent hover:text-ink"
            }`}
          >
            {o.dot && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
            {o.label}
            {o.count != null && <span className="opacity-70">({o.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---- loading splash ----
export function Loader({ msg }: { msg?: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
      <motion.div
        className="h-12 w-12 rounded-xl bg-grid-accent"
        animate={{ rotate: 360, borderRadius: ["20%", "50%", "20%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="text-sm text-muted">{msg || "Loading congestion intelligence…"}</div>
    </div>
  );
}

// ---- error state ----
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-crit/15 text-2xl">⚠️</div>
      <div className="text-lg font-bold text-ink">Couldn't load the data</div>
      <p className="max-w-md text-sm text-muted">
        {message}. Make sure <code className="rounded bg-panel2 px-1.5 py-0.5 text-accent">public/data/grid.json</code>{" "}
        exists — regenerate it by running{" "}
        <code className="rounded bg-panel2 px-1.5 py-0.5 text-accent">python src/pipeline.py</code> in the repo root.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-bg transition-transform hover:scale-105"
      >
        Retry
      </button>
    </div>
  );
}
