import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useData } from "../lib/data";
import { aggregateRadius, type AreaStats } from "../lib/aggregate";
import { fmt, pct, shortLoc } from "../lib/format";
import { TIER_COLOR, type Tier } from "../lib/types";
import { Loader, ErrorState, Pills } from "../components/ui";
import GridMap from "../components/GridMap";
import AreaPanel from "../components/AreaPanel";

type SideTab = "area" | "worklist";

const RADII = [300, 500, 800, 1200];

export default function Dashboard() {
  const { data, error } = useData();
  const [showHeat, setShowHeat] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [tab, setTab] = useState<SideTab>("area");
  const [radius, setRadius] = useState(500);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);

  // shareable deep-link: #/dashboard?pin=lat,lon,radius drops a pin on load
  useEffect(() => {
    const q = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const p = q.get("pin");
    if (p) {
      const [la, lo, r] = p.split(",").map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        setPin({ lat: la, lon: lo });
        // snap an arbitrary deep-link radius to the nearest allowed value so the
        // radius buttons stay in sync with what's drawn
        if (Number.isFinite(r)) {
          const snapped = RADII.reduce((p, c) => (Math.abs(c - r) < Math.abs(p - r) ? c : p), RADII[0]);
          setRadius(snapped);
        }
        setFlyTo({ lat: la, lon: lo, zoom: 15 });
      }
    }
  }, []);

  const stats: AreaStats | null = useMemo(() => {
    if (!data || !pin) return null;
    return aggregateRadius(
      data.cells,
      data.hotspots,
      data.forecast.zones,
      pin.lat,
      pin.lon,
      radius,
      data.summary.kpis.total_violations,
    );
  }, [data, pin, radius]);

  const worklist = useMemo(() => {
    if (!data) return [];
    return data.hotspots
      .filter((h) => tierFilter === "all" || h.priority_tier === tierFilter)
      .slice(0, 120);
  }, [data, tierFilter]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loader />;
  const k = data.summary.kpis;

  function pick(lat: number, lon: number) {
    setPin({ lat, lon });
    setTab("area");
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      {/* page header */}
      <motion.div
        className="mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="text-xs font-bold uppercase tracking-[0.15em] text-accent">
          Congestion Intelligence · the rear-view
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          Explore the city — or drop a pin on any neighbourhood
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Toggle the layers, then click anywhere on the map for an exact area report. Or open the
          worklist for the ranked enforcement plan.
        </p>
      </motion.div>

      {/* KPI ribbon */}
      <motion.div
        className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {[
          { v: fmt(k.total_violations), l: "Violations", c: "#4cc9f0" },
          { v: String(k.hotspot_zones), l: "Hotspot zones", c: "#ffd166" },
          { v: `${k.critical_zones + k.high_zones}`, l: "Critical + High", c: "#ff4d5e" },
          { v: `${data.summary.impact_concentration.top_10pct_cells_impact_share}%`, l: "Impact in top 10%", c: "#4cc9a0" },
          { v: `${k.junction_violation_pct}%`, l: "On junctions", c: "#7b5cff" },
        ].map((s) => (
          <div key={s.l} className="glass-soft px-3.5 py-2.5">
            <div className="text-xl font-extrabold" style={{ color: s.c }}>
              {s.v}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted">{s.l}</div>
          </div>
        ))}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* MAP */}
        <div className="glass relative h-[72vh] overflow-hidden p-0">
          <GridMap
            cells={data.cells}
            hotspots={data.hotspots}
            forecast={data.forecast.zones}
            showHeat={showHeat}
            zoneMode={showZones ? "enforcement" : "none"}
            pin={pin}
            radiusM={radius}
            onPick={pick}
            onZoneClick={(id) => {
              const h = data.hotspots.find((x) => x.cluster_id === id);
              if (h) {
                setPin({ lat: h.lat, lon: h.lon });
                setTab("area");
              }
            }}
            flyTo={flyTo}
          />
          {/* map controls overlay */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between p-3">
            <div className="pointer-events-auto glass px-3 py-2.5">
              <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted2">Map layers</div>
              <div className="flex flex-col gap-1.5">
                <Toggle checked={showHeat} onChange={setShowHeat} label="Congestion heatmap" dot="linear-gradient(90deg,#4cc9f0,#ff4d5e)" />
                <Toggle checked={showZones} onChange={setShowZones} label="Hotspot zones" dot={TIER_COLOR.Critical} />
              </div>
              {!showHeat && !showZones && (
                <div className="mt-1.5 max-w-[150px] text-[10px] leading-snug text-accent">
                  Clean map — click anywhere to analyse that spot.
                </div>
              )}
            </div>
            <div className="pointer-events-auto glass px-3 py-2.5 text-right">
              <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted2">
                Pin radius · {radius} m
              </div>
              <div className="flex gap-1">
                {RADII.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                      r === radius ? "bg-accent text-bg" : "bg-panel2 text-muted hover:text-ink"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* drop-a-pin hint (only when no pin yet) */}
          {!pin && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[400] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg/70 px-4 py-2 text-xs font-semibold text-ink backdrop-blur-sm"
            >
              📍 Click anywhere to analyse that area
            </motion.div>
          )}

          {/* legend */}
          {(showHeat || showZones) && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500] glass px-3 py-2 text-[11px]">
              {showZones ? (
                <>
                  <div className="mb-1 text-[9px] uppercase tracking-wide text-muted2">Enforcement priority</div>
                  <div className="flex gap-3">
                    {(["Critical", "High", "Medium", "Low"] as Tier[]).map((t) => (
                      <span key={t} className="flex items-center gap-1.5 text-muted">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[t] }} />
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-1 text-[9px] uppercase tracking-wide text-muted2">Congestion impact</div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">low</span>
                    <span
                      className="h-2 w-24 rounded"
                      style={{ background: "linear-gradient(90deg,#1d3a8f,#4cc9f0,#ffd166,#ff9f1c,#ff4d5e)" }}
                    />
                    <span className="text-muted">high</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* SIDE PANEL */}
        <div className="glass flex h-[72vh] flex-col overflow-hidden">
          <div className="flex border-b border-borderSoft">
            {(["area", "worklist"] as SideTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
                  tab === t ? "border-b-2 border-accent text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t === "area" ? "📍 Area Explorer" : "📋 Worklist"}
              </button>
            ))}
          </div>

          {tab === "area" ? (
            <div className="flex-1 overflow-hidden">
              <AreaPanel stats={stats} radiusM={radius} onClear={() => setPin(null)} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-borderSoft p-3">
                <Pills
                  value={tierFilter}
                  onChange={setTierFilter}
                  options={[
                    { key: "all", label: "All" },
                    { key: "Critical", label: "Critical", dot: TIER_COLOR.Critical },
                    { key: "High", label: "High", dot: TIER_COLOR.High },
                    { key: "Medium", label: "Medium", dot: TIER_COLOR.Medium },
                    { key: "Low", label: "Low", dot: TIER_COLOR.Low },
                  ]}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {worklist.map((h, i) => (
                  <motion.button
                    key={h.cluster_id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    onClick={() => {
                      setFlyTo({ lat: h.lat, lon: h.lon, zoom: 15 });
                      setPin({ lat: h.lat, lon: h.lon });
                      setTab("area"); // jump to the area report for the picked zone
                    }}
                    className="mb-2 w-full rounded-xl border border-borderSoft bg-panel2 p-3 text-left transition-all hover:translate-x-1 hover:border-accent"
                    style={{ borderLeft: `4px solid ${TIER_COLOR[h.priority_tier]}` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted2">RANK #{h.rank}</span>
                      <span
                        className="chip text-[9px]"
                        style={{
                          color: TIER_COLOR[h.priority_tier],
                          borderColor: `${TIER_COLOR[h.priority_tier]}55`,
                          background: `${TIER_COLOR[h.priority_tier]}1a`,
                        }}
                      >
                        {h.priority_tier}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between">
                      <div className="text-sm font-semibold text-ink">
                        {shortLoc(h.sample_location, h.top_station)}
                      </div>
                      <div className="text-lg font-extrabold" style={{ color: TIER_COLOR[h.priority_tier] }}>
                        {h.priority_score}
                      </div>
                    </div>
                    <div className="text-[11px] text-accent">{h.top_station} division</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted">
                      <span className="rounded-md bg-bg2 px-2 py-0.5">{fmt(h.violations)} violations</span>
                      <span className="rounded-md bg-bg2 px-2 py-0.5">{pct(h.junction_share)} junction</span>
                      <span className="rounded-md bg-bg2 px-2 py-0.5">{h.distinct_days}d active</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  dot,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  dot: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink">
      <span
        className={`relative h-4 w-4 shrink-0 rounded border transition-colors ${
          checked ? "border-accent bg-accent" : "border-border bg-panel2"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="absolute inset-0 h-4 w-4 text-bg" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
      {label}
    </label>
  );
}
