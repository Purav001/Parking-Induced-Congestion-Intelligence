import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../lib/data";
import { fmt, shortLoc } from "../lib/format";
import { TIER_COLOR, type ForecastZone } from "../lib/types";
import { Loader, ErrorState, Pills, TrendBadge, SectionTitle, stagger, item } from "../components/ui";
import GridMap from "../components/GridMap";
import ForecastReport from "../components/ForecastReport";

type Filter = "all" | "movers" | "Rising" | "Critical" | "High" | "Medium" | "Low";

function isMover(z: ForecastZone) {
  return z.rank_enforcement - z.forecast_rank >= 10 && z.risk_score >= 50;
}

export default function Forecast() {
  const { data, error } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [selected, setSelected] = useState<ForecastZone | null>(null);
  const [tab, setTab] = useState<"roster" | "report">("roster");

  const movers = useMemo(() => (data ? data.forecast.zones.filter(isMover) : []), [data]);

  const zones = useMemo(() => {
    if (!data) return [];
    let z = data.forecast.zones;
    if (filter === "movers") z = z.filter(isMover);
    else if (filter === "Rising") z = z.filter((x) => x.trend === "Rising");
    else if (filter !== "all") z = z.filter((x) => x.risk_tier === filter);
    return z;
  }, [data, filter]);

  function selectZone(z: ForecastZone) {
    setSelected(z);
    setFlyTo({ lat: z.lat, lon: z.lon, zoom: 15 });
    setTab("report"); // jump to the report for the picked zone (like the dashboard)
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loader msg="Loading patrol forecast…" />;
  const f = data.forecast;
  const rs = f.roster_summary;
  const bt = f.backtest.station;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <SectionTitle
        kicker="Patrol Forecast · the windshield"
        title="Where to send patrols next week"
        sub="A recency-weighted, trend-aware risk score per zone — turned into a weekly patrol roster, validated on held-out data."
      />

      {/* validation banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex items-start gap-3 rounded-2xl border border-low/40 bg-low/[0.07] p-4"
      >
        <span className="text-2xl">✅</span>
        <div>
          <div className="text-sm font-bold text-low">Validated on held-out data</div>
          <p className="mt-0.5 text-sm text-muted">
            {f.backtest.headline} Method: recency-weighted history (30-day half-life) → 0–100 risk,
            +trend. No training, fully reproducible.
          </p>
        </div>
        <div className="ml-auto hidden shrink-0 gap-2 sm:flex">
          <Stat v={`${Math.round(bt.recall_at_20 * 100)}%`} l="recall@20" />
          <Stat v={`${bt.spearman}`} l="Spearman ρ" />
        </div>
      </motion.div>

      {/* roster summary */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <RosterCard v={fmt(rs.total_visits_per_week)} l="Patrol visits / week" c="#4cc9f0" />
        <RosterCard v={String(movers.length)} l="📈 Movers · worklist underrates" c="#7b5cff" />
        <RosterCard v={String(rs.rising_zones)} l="Zones trending up ▲" c="#ff9f1c" />
        <RosterCard
          v={`${rs.tier_counts.Critical}/${rs.tier_counts.High}`}
          l="Critical / High zones"
          c="#ff4d5e"
        />
      </motion.div>

      {/* honesty caveat */}
      <div className="mb-5 rounded-xl border-l-4 border-high bg-high/[0.06] px-4 py-3 text-xs leading-relaxed text-muted">
        <b className="text-high">Honest scope:</b> the forecast predicts <b>where</b> risk
        concentrates (strong signal) and whether a zone is <b>heating up</b>. It does not claim the
        exact hour — timestamps are enforcement-logging times, so each shift window is a
        recorded-ticket slot (overnight ones flagged ⚠). Fusing a live traffic-speed feed would
        calibrate timing to true congestion.
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* risk map */}
        <div className="glass relative h-[72vh] overflow-hidden p-0">
          {/* map title — shows the selected zone's name */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pointer-events-none absolute left-3 right-3 top-3 z-[500] glass px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[selected.risk_tier] }} />
                  <span className="text-sm font-bold text-ink">
                    {shortLoc(selected.sample_location, selected.top_station)}
                  </span>
                  <span className="text-xs text-muted">— {selected.risk_tier} risk · {selected.trend}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <GridMap
            cells={data.cells}
            hotspots={data.hotspots}
            forecast={data.forecast.zones}
            showHeat={false}
            zoneMode="forecast"
            pin={null}
            radiusM={0}
            onPick={() => {}}
            onZoneClick={(id) => {
              const z = data.forecast.zones.find((x) => x.cluster_id === id);
              if (z) selectZone(z);
            }}
            flyTo={flyTo}
            highlight={
              selected ? { lat: selected.lat, lon: selected.lon, color: TIER_COLOR[selected.risk_tier] } : null
            }
          />
          {/* legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] glass px-3 py-2 text-[11px]">
            <div className="mb-1 text-[9px] uppercase tracking-wide text-muted2">Forecast risk · solid = rising</div>
            <div className="flex gap-3">
              {(["Critical", "High", "Medium", "Low"] as const).map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[t] }} />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* tabbed sidebar — Roster | Report (mirrors the dashboard) */}
        <div className="glass flex h-[72vh] flex-col overflow-hidden">
          <div className="flex border-b border-borderSoft">
            {([["roster", "📋 Roster"], ["report", "🛰️ Report"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
                  tab === key ? "border-b-2 border-accent text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "roster" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-borderSoft p-3">
                <Pills
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { key: "all", label: "All" },
                    { key: "movers", label: "📈 Movers", count: movers.length },
                    { key: "Rising", label: "▲ Rising", dot: "#ff9f1c" },
                    { key: "Critical", label: "Critical", dot: TIER_COLOR.Critical },
                    { key: "High", label: "High", dot: TIER_COLOR.High },
                    { key: "Medium", label: "Medium", dot: TIER_COLOR.Medium },
                    { key: "Low", label: "Low", dot: TIER_COLOR.Low },
                  ]}
                />
                <div className="mt-2 text-[11px] text-muted2">
                  {filter === "movers"
                    ? "Zones the rear-view worklist underrates — recent activity flags them now"
                    : "Next-week patrol roster"}{" "}
                  · {zones.length} zones
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {zones.map((z, i) => (
                  <ZoneCard
                    key={z.cluster_id}
                    z={z}
                    i={i}
                    mover={isMover(z)}
                    selected={selected?.cluster_id === z.cluster_id}
                    onSelect={selectZone}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <ForecastReport zone={selected} onClear={() => { setSelected(null); setTab("roster"); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ZoneCard({
  z,
  i,
  mover,
  selected,
  onSelect,
}: {
  z: ForecastZone;
  i: number;
  mover: boolean;
  selected: boolean;
  onSelect: (z: ForecastZone) => void;
}) {
  const c = TIER_COLOR[z.risk_tier];
  const shiftBad = z.shift_skew === "overnight";
  const shiftSoft = z.shift_skew === "batch-band";
  return (
    <motion.button
      variants={item}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.02, 0.4) }}
      onClick={() => onSelect(z)}
      className={`mb-2 w-full rounded-xl border bg-panel2 p-3 text-left transition-all hover:translate-x-1 hover:border-accent ${
        selected ? "border-accent ring-1 ring-accent" : "border-borderSoft"
      }`}
      style={{
        borderLeft: `4px solid ${mover ? "#7b5cff" : c}`,
        background: mover ? "linear-gradient(180deg,rgba(123,92,255,0.07),#18233c 60%)" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted2">
          FORECAST #{z.forecast_rank}
          {mover && (
            <span className="ml-1.5 rounded bg-accent2 px-1.5 py-0.5 text-[8.5px] font-black text-bg">
              MOVER
            </span>
          )}
        </span>
        <TrendBadge trend={z.trend} />
      </div>
      <div className="mt-1.5 flex items-end justify-between">
        <div className="text-sm font-semibold text-ink">
          {shortLoc(z.sample_location, z.top_station)}
        </div>
        <div className="text-lg font-extrabold" style={{ color: c }}>
          {z.risk_score}
        </div>
      </div>
      <div className="text-[11px] text-accent">{z.top_station} division</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded-md bg-accent/10 px-2 py-0.5 font-semibold text-accent">
          🚓 {z.cadence_per_week}×/week
        </span>
        <span
          className={`rounded-md px-2 py-0.5 ${
            shiftBad ? "bg-high/10 text-high" : shiftSoft ? "bg-med/10 text-med" : "bg-bg2 text-muted"
          }`}
        >
          {shiftBad ? "⚠ logging time" : "🕑"} {z.shift_window}
        </span>
        {mover && (
          <span className="rounded-md border border-accent2/40 bg-accent2/10 px-2 py-0.5 text-accent2">
            Worklist #{z.rank_enforcement} → #{z.forecast_rank}
          </span>
        )}
      </div>
    </motion.button>
  );
}

function RosterCard({ v, l, c }: { v: string; l: string; c: string }) {
  return (
    <motion.div variants={item} className="glass-soft px-4 py-3.5">
      <div className="text-2xl font-extrabold" style={{ color: c }}>
        {v}
      </div>
      <div className="mt-1 text-[10.5px] uppercase tracking-wide text-muted">{l}</div>
    </motion.div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg border border-low/30 bg-low/5 px-3 py-1.5 text-center">
      <div className="text-lg font-extrabold text-low">{v}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted">{l}</div>
    </div>
  );
}
