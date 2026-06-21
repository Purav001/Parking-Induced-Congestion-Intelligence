import { motion } from "framer-motion";
import type { AreaStats } from "../lib/aggregate";
import { sortedEntries, PEAK_HOURS as PEAK } from "../lib/aggregate";
import { VIOL_LABEL, VEH_LABEL, TIER_COLOR } from "../lib/types";
import { fmt, fmtFull, pct } from "../lib/format";
import { BarRow } from "./ui";

export default function AreaPanel({
  stats,
  radiusM,
  onClear,
}: {
  stats: AreaStats | null;
  radiusM: number;
  onClear: () => void;
}) {
  if (!stats) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-panel2 text-2xl">📍</div>
        <div className="text-sm font-semibold text-ink">Drop a pin anywhere on the map</div>
        <p className="max-w-[240px] text-xs leading-relaxed text-muted">
          Click any point and GRID aggregates every violation within {Math.round(radiusM)} m —
          exact totals, not a sample — into a live area report.
        </p>
      </div>
    );
  }

  if (stats.violations === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm font-semibold text-ink">No violations in this radius</div>
        <p className="max-w-[240px] text-xs text-muted">
          Try a busier area or widen the radius with the slider above.
        </p>
        <button onClick={onClear} className="chip border-borderSoft text-muted hover:text-ink">
          Clear pin
        </button>
      </div>
    );
  }

  const hMax = Math.max(...stats.hours, 1);
  const violRows = sortedEntries(stats.viol)
    .filter(([k]) => k !== "other")
    .slice(0, 5);
  const violMax = violRows[0]?.[1] || 1;
  const vehRows = sortedEntries(stats.veh).slice(0, 5);
  const vehMax = vehRows[0]?.[1] || 1;
  const topZone = stats.forecastInside[0];
  const areaCadence = stats.forecastInside.reduce((s, z) => s + z.cadence_per_week, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex h-full flex-col overflow-y-auto px-4 py-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-accent">Area report</div>
          <div className="text-sm text-muted">
            {Math.round(radiusM)} m radius · {stats.topStation} division
          </div>
        </div>
        <button
          onClick={onClear}
          className="chip border-borderSoft text-muted hover:border-accent hover:text-ink"
        >
          Clear
        </button>
      </div>

      {/* severity banner */}
      <div
        className="mb-3 flex items-center justify-between rounded-xl border px-3.5 py-2.5"
        style={{
          borderColor: `${TIER_COLOR[stats.severity]}55`,
          background: `${TIER_COLOR[stats.severity]}14`,
        }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">This area is</div>
          <div className="text-lg font-black" style={{ color: TIER_COLOR[stats.severity] }}>
            {stats.severity} severity
          </div>
        </div>
        <span
          className="grid h-9 w-9 place-items-center rounded-full text-base font-black"
          style={{ background: `${TIER_COLOR[stats.severity]}22`, color: TIER_COLOR[stats.severity] }}
        >
          {stats.severity[0]}
        </span>
      </div>

      {/* headline metrics */}
      <div className="grid grid-cols-2 gap-2">
        <Metric value={fmtFull(stats.violations)} label="Violations" accent="#4cc9f0" />
        <Metric value={fmt(stats.cis)} label="Congestion impact" accent="#7b5cff" />
        <Metric value={pct(stats.cityShare)} label="of city total" accent="#ffd166" />
        <Metric value={pct(stats.peakShare)} label="in peak hours" accent="#ff9f1c" />
      </div>

      {/* hour pattern */}
      <SectionLabel>When (by hour, IST)</SectionLabel>
      <div className="flex h-16 items-end gap-[2px]">
        {stats.hours.map((v, h) => (
          <div key={h} className="flex-1" title={`${h}:00 — ${v.toLocaleString()}`}>
            <motion.div
              className="rounded-t-sm"
              style={{ background: PEAK.has(h) ? "#ff4d5e" : "#4cc9f0", opacity: 0.9 }}
              initial={{ height: 0 }}
              animate={{ height: `${(v / hMax) * 100}%` }}
              transition={{ duration: 0.5, delay: h * 0.012 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted2">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-muted2">
        <span className="text-crit">Red</span> = peak hours. Times reflect when violations are
        logged.
      </p>

      {/* violation mix */}
      <SectionLabel>Violation mix</SectionLabel>
      {violRows.map(([k, v], i) => (
        <BarRow
          key={k}
          label={VIOL_LABEL[k] || k}
          value={v}
          max={violMax}
          display={fmt(v)}
          delay={i * 0.05}
        />
      ))}

      {/* vehicle mix */}
      <SectionLabel>Offending vehicles</SectionLabel>
      {vehRows.map(([k, v], i) => (
        <BarRow
          key={k}
          label={VEH_LABEL[k] || k}
          value={v}
          max={vehMax}
          display={fmt(v)}
          color="linear-gradient(90deg,#ff9f1c,#ff4d5e)"
          delay={i * 0.05}
        />
      ))}

      {/* zones inside */}
      <SectionLabel>
        Hotspot zones inside ({stats.hotspotsInside.length})
      </SectionLabel>
      {stats.hotspotsInside.slice(0, 4).map((h) => (
        <div
          key={h.cluster_id}
          className="mb-1.5 flex items-center justify-between rounded-lg border border-borderSoft bg-panel2 px-3 py-2"
        >
          <span className="truncate text-xs text-ink">#{h.rank} · {h.top_station}</span>
          <span
            className="chip shrink-0 text-[10px]"
            style={{
              color: TIER_COLOR[h.priority_tier],
              borderColor: `${TIER_COLOR[h.priority_tier]}55`,
              background: `${TIER_COLOR[h.priority_tier]}1a`,
            }}
          >
            {h.priority_score}
          </span>
        </div>
      ))}
      {stats.hotspotsInside.length === 0 && (
        <p className="text-xs text-muted2">No ranked hotspot zone centroid in this radius.</p>
      )}

      {/* ---- PATROL FORECAST for this area ---- */}
      {topZone ? (
        <>
          <SectionLabel>🛰️ Patrol forecast for this area</SectionLabel>
          <div className="rounded-xl border border-low/30 bg-low/[0.06] p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted">Highest-risk zone here</div>
              <span
                className="chip text-[10px]"
                style={{
                  color: TIER_COLOR[topZone.risk_tier],
                  borderColor: `${TIER_COLOR[topZone.risk_tier]}55`,
                  background: `${TIER_COLOR[topZone.risk_tier]}1a`,
                }}
              >
                {topZone.risk_tier} risk
              </span>
            </div>
            <div className="mt-1.5 flex items-end gap-3">
              <div className="text-3xl font-black text-low">{topZone.risk_score}</div>
              <div className="pb-1 text-xs text-muted2">/ 100 risk score</div>
            </div>
            {/* risk meter */}
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-bg2">
              <motion.div
                className="h-full rounded"
                style={{ background: TIER_COLOR[topZone.risk_tier] }}
                initial={{ width: 0 }}
                animate={{ width: `${topZone.risk_score}%` }}
                transition={{ duration: 0.7 }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-md bg-accent/10 px-2 py-1 font-semibold text-accent">
                🚓 {topZone.cadence_per_week}×/week patrols
              </span>
              <span
                className={`rounded-md px-2 py-1 font-semibold ${
                  topZone.trend === "Rising"
                    ? "bg-high/10 text-high"
                    : topZone.trend === "Cooling"
                    ? "bg-accent/10 text-accent"
                    : "bg-bg2 text-muted"
                }`}
              >
                {topZone.trend === "Rising" ? "▲" : topZone.trend === "Cooling" ? "▼" : "—"}{" "}
                {topZone.trend}
              </span>
              <span
                className={`rounded-md px-2 py-1 ${
                  topZone.shift_skew === "overnight" ? "bg-high/10 text-high" : "bg-bg2 text-muted"
                }`}
              >
                {topZone.shift_skew === "overnight" ? "⚠ logging time" : "🕑"} {topZone.shift_window}
              </span>
            </div>
            {areaCadence > 0 && (
              <div className="mt-2.5 border-t border-low/20 pt-2 text-[11px] text-muted">
                Across all {stats.forecastInside.length} forecast zone
                {stats.forecastInside.length === 1 ? "" : "s"} in this radius:{" "}
                <b className="text-low">{areaCadence} patrol visits / week</b> recommended.
              </div>
            )}
            <p className="mt-2 text-[10px] leading-snug text-muted2">
              Forecast predicts <b className="text-muted">where</b> risk concentrates; shift windows
              are recorded-ticket times, not exact congestion hours.
            </p>
          </div>
        </>
      ) : (
        <>
          <SectionLabel>🛰️ Patrol forecast</SectionLabel>
          <p className="text-xs text-muted2">
            No forecast zone centroid in this radius — widen it or pick a busier area.
          </p>
        </>
      )}
    </motion.div>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="rounded-xl border border-borderSoft bg-panel2 px-3 py-2.5">
      <div className="text-lg font-extrabold" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">
      {children}
    </div>
  );
}
