import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  Cell as RCell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
} from "recharts";
import { useData } from "../lib/data";
import { fmt } from "../lib/format";
import { Loader, ErrorState, SectionTitle, GlowCard, stagger, item } from "../components/ui";
import { PEAK_HOURS as PEAK } from "../lib/aggregate";

const tooltipStyle = {
  background: "#111a2e",
  border: "1px solid #24324d",
  borderRadius: 12,
  color: "#eaf1fb",
  fontSize: 12,
};

export default function Insights() {
  const { data, error } = useData();
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loader msg="Loading city insights…" />;
  const s = data.summary;
  const ic = s.impact_concentration;

  const hourData = s.hour_histogram.map((d) => ({ ...d, peak: PEAK.has(d.hour) }));
  const violData = s.violation_distribution.slice(0, 6).map((d) => ({
    name: d.type.replace(/PARKING/gi, "").replace(/\b(IN A|ON|NEAR)\b/gi, "").trim() || d.type,
    cis: Math.round(d.cis),
  }));
  const vehData = s.vehicle_distribution.slice(0, 6).map((d) => ({
    name: d.vehicle_type,
    cis: Math.round(d.cis),
  }));
  const stationData = s.stations.slice(0, 8).map((d) => ({
    name: d.police_station,
    cis: Math.round(d.cis),
  }));
  const concData = [
    { name: "Top 1%", v: ic.top_1pct_cells_impact_share },
    { name: "Top 5%", v: ic.top_5pct_cells_impact_share },
    { name: "Top 10%", v: ic.top_10pct_cells_impact_share },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-7">
      <SectionTitle
        kicker="City Insights · the why"
        title="Every chart, computed live from the data"
        sub="Ranked by congestion impact (CIS) — not raw counts — so lane-blocking offences and bigger vehicles weigh more."
      />

      {/* concentration hero */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]"
      >
        <motion.div variants={item}>
          <GlowCard className="h-full">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-accent">
              Why targeted enforcement wins
            </div>
            <h3 className="mb-4 text-lg font-bold">Congestion impact is extremely concentrated</h3>
            {concData.map((d, i) => (
              <div key={d.name} className="mb-3 flex items-center gap-3">
                <span className="w-20 text-sm text-muted">{d.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-bg2">
                  <motion.div
                    className="h-full rounded bg-grid-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${d.v}%` }}
                    transition={{ duration: 1, delay: 0.2 + i * 0.15 }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-sm font-bold text-ink">{d.v}%</span>
              </div>
            ))}
            <p className="mt-3 text-xs leading-relaxed text-muted2">
              <b className="text-accent">{ic.top_10pct_cells_impact_share}%</b> of all congestion
              impact sits in just 10% of the active map area — focus patrols there and you cover
              the damage blanket coverage misses.
            </p>
          </GlowCard>
        </motion.div>

        <motion.div variants={item}>
          <GlowCard glow="violet" className="h-full">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-accent2">
              When violations choke traffic
            </div>
            <h3 className="mb-3 text-lg font-bold">By hour of day (IST)</h3>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={hourData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2640" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: "#6477a0", fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: "#6477a0", fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff08" }} formatter={(v: number) => [fmt(v), "violations"]} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {hourData.map((d) => (
                    <RCell key={d.hour} fill={d.peak ? "#ff4d5e" : "#4cc9f0"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-xs text-muted2">
              <span className="text-crit">Red</span> = peak hours. Times reflect enforcement
              logging.
            </p>
          </GlowCard>
        </motion.div>
      </motion.div>

      {/* bottom 3 charts */}
      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <ChartCard title="Impact by violation type" data={violData} color="#4cc9f0" />
        <ChartCard title="Impact by vehicle type" data={vehData} color="#ff9f1c" />
        <ChartCard title="Worst police divisions" data={stationData} color="#7b5cff" />
      </motion.div>

      {/* daily trend */}
      <motion.div variants={item} initial="initial" whileInView="animate" viewport={{ once: true }} className="mt-4">
        <GlowCard>
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-accent">
            Violations by day of week
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart
              data={s.dow_histogram.map((d) => ({
                name: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.dow] ?? d.dow,
                count: d.count,
              }))}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="dowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4cc9f0" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#4cc9f0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2640" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#6477a0", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6477a0", fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "violations"]} />
              <Area type="monotone" dataKey="count" stroke="#4cc9f0" strokeWidth={2} fill="url(#dowGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </GlowCard>
      </motion.div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  color,
}: {
  title: string;
  data: { name: string; cis: number }[];
  color: string;
}) {
  return (
    <motion.div variants={item}>
      <GlowCard className="h-full">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color }}>
          {title}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={{ fill: "#93a5c4", fontSize: 10.5 }}
              tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff08" }} formatter={(v: number) => [fmt(v), "CIS"]} />
            <Bar dataKey="cis" radius={[0, 4, 4, 0]} fill={color} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </GlowCard>
    </motion.div>
  );
}
