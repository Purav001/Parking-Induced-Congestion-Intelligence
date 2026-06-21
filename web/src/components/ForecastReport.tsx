import { motion } from "framer-motion";
import type { ForecastZone } from "../lib/types";
import { TIER_COLOR } from "../lib/types";
import { fmt, shortLoc } from "../lib/format";
import { BarRow } from "./ui";

/**
 * Detailed report for a forecast zone selected on the Forecast page — mirrors the
 * dashboard's Area Explorer panel so the two pages feel consistent.
 */
export default function ForecastReport({
  zone,
  onClear,
}: {
  zone: ForecastZone | null;
  onClear: () => void;
}) {
  if (!zone) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-panel2 text-2xl">🛰️</div>
        <div className="text-sm font-semibold text-ink">Select a zone</div>
        <p className="max-w-[240px] text-xs leading-relaxed text-muted">
          Click any zone on the map or in the roster to see its full patrol-forecast report.
        </p>
      </div>
    );
  }

  const c = TIER_COLOR[zone.risk_tier];
  const skewBad = zone.shift_skew === "overnight";
  const totV = zone.top_violations.reduce((s, v) => s + v.count, 0);
  const violMax = zone.top_violations[0]?.count || 1;

  return (
    <motion.div
      key={zone.cluster_id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full flex-col overflow-y-auto px-4 py-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-low">Forecast report</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">
            {shortLoc(zone.sample_location, zone.top_station)}
          </div>
          <div className="text-[11px] text-accent">{zone.top_station} division</div>
        </div>
        <button
          onClick={onClear}
          className="chip shrink-0 border-borderSoft text-muted hover:border-accent hover:text-ink"
        >
          Clear
        </button>
      </div>

      {/* risk hero */}
      <div className="rounded-xl border p-3" style={{ borderColor: `${c}44`, background: `${c}12` }}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Forecast risk score</span>
          <span className="chip text-[10px]" style={{ color: c, borderColor: `${c}55`, background: `${c}1a` }}>
            {zone.risk_tier}
          </span>
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-black" style={{ color: c }}>
            {zone.risk_score}
          </span>
          <span className="pb-1.5 text-xs text-muted2">/ 100</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-bg2">
          <motion.div
            className="h-full rounded"
            style={{ background: c }}
            initial={{ width: 0 }}
            animate={{ width: `${zone.risk_score}%` }}
            transition={{ duration: 0.7 }}
          />
        </div>
      </div>

      {/* metric grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric value={`${zone.cadence_per_week}×`} label="Patrols / week" />
        <Metric value={String(zone.recent_violations_21d)} label="Violations · 21d" />
        <Metric value={`#${zone.forecast_rank}`} label="Forecast rank" />
        <Metric value={`#${zone.rank_enforcement}`} label="Worklist rank" />
      </div>

      {/* trend */}
      <SectionLabel>Trend</SectionLabel>
      <div className="rounded-xl border border-borderSoft bg-panel2 p-3 text-xs leading-relaxed text-muted">
        {zone.trend === "Rising" ? (
          <>
            <b className="text-high">▲ Rising</b> — recent activity is up
            {zone.trend_ratio ? ` (${zone.trend_ratio}× the prior 3 weeks)` : ""}. Backtest shows
            rising zones keep rising — prioritise now.
          </>
        ) : zone.trend === "Cooling" ? (
          <>
            <b className="text-accent">▼ Cooling</b> — easing recently, but keep monitoring (cooling
            is a weaker signal than rising).
          </>
        ) : (
          <>
            <b className="text-muted">— Steady</b> — stable, persistent risk.
          </>
        )}
      </div>

      {/* recommended shift */}
      <SectionLabel>Suggested enforcement shift</SectionLabel>
      <div className="rounded-xl border border-borderSoft bg-panel2 p-3">
        <span
          className={`chip text-[11px] ${
            skewBad ? "border-high/40 bg-high/10 text-high" : "border-borderSoft bg-bg2 text-ink"
          }`}
        >
          {skewBad ? "⚠ overnight = logging time" : "🕑"} {zone.shift_window}
        </span>
        <p className="mt-2 text-[11px] leading-snug text-muted2">
          {skewBad
            ? "Records cluster overnight — a batch-logging artifact. Don't deploy on this window; use a daytime shift from local knowledge."
            : "Most common recorded-ticket window for this zone. Confirm against ground traffic — timestamps are logging times, not measured congestion."}
        </p>
      </div>

      {/* violation mix */}
      {zone.top_violations.length > 0 && (
        <>
          <SectionLabel>Violation mix</SectionLabel>
          {zone.top_violations.slice(0, 4).map((v, i) => (
            <BarRow
              key={v.type}
              label={v.type.replace(/PARKING/gi, "").trim() || v.type}
              value={v.count}
              max={violMax}
              display={fmt(v.count)}
              delay={i * 0.05}
            />
          ))}
          <div className="mt-1 text-[10px] text-muted2">{fmt(totV)} violations profiled in this zone</div>
        </>
      )}

      {/* junctions */}
      {zone.top_junctions.length > 0 && (
        <>
          <SectionLabel>Junctions affected</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {zone.top_junctions.map((j) => (
              <span key={j} className="rounded-md bg-bg2 px-2 py-1 text-[10px] text-muted">
                📍 {j}
              </span>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-borderSoft bg-panel2 px-3 py-2.5">
      <div className="text-lg font-extrabold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">{children}</div>
  );
}
