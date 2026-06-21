import type { Cell, Hotspot, ForecastZone, Tier } from "./types";

const EARTH_M = 6_371_000;

/** Peak-hour set (IST) — single source of truth, mirrors weights.py PEAK_HOURS. */
export const PEAK_HOURS = new Set([8, 9, 10, 11, 17, 18, 19, 20]);

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_M * 2 * Math.asin(Math.sqrt(a));
}

export interface AreaStats {
  cells: number;
  violations: number;
  cis: number;
  peakViolations: number; // violations in peak hours (8-11, 17-20)
  peakShare: number;
  hours: number[]; // 24
  veh: Record<string, number>;
  viol: Record<string, number>;
  topStation: string;
  hotspotsInside: Hotspot[];
  forecastInside: ForecastZone[];
  /** city-share: what % of all city violations this radius holds */
  cityShare: number;
  /** overall severity of this area (worst hotspot tier inside, else density-based) */
  severity: Tier;
}

const PEAK = PEAK_HOURS;
const TIER_RANK: Record<Tier, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

/**
 * Classify a pinned area's severity. Primary signal = the worst enforcement tier of
 * any hotspot zone inside it (those are the modelled, ranked truth). If no ranked
 * zone falls in the radius, fall back to a CIS-density threshold so even quiet spots
 * get an honest Low/Medium read.
 */
function classifyArea(hotspotsInside: Hotspot[], cis: number, violations: number): Tier {
  if (hotspotsInside.length) {
    return hotspotsInside.reduce<Tier>(
      (worst, h) => (TIER_RANK[h.priority_tier] > TIER_RANK[worst] ? h.priority_tier : worst),
      "Low",
    );
  }
  // density fallback (CIS per area) for areas with no ranked zone centroid
  if (cis >= 1500 || violations >= 1500) return "Medium";
  if (cis >= 300 || violations >= 300) return "Low";
  return "Low";
}

/**
 * EXACT aggregation: every violation lives in exactly one ~110 m cell, so summing
 * the cells whose centroid falls inside the radius gives true totals (not a sample).
 */
export function aggregateRadius(
  cells: Cell[],
  hotspots: Hotspot[],
  forecast: ForecastZone[],
  centerLat: number,
  centerLon: number,
  radiusM: number,
  cityTotalViolations: number,
): AreaStats {
  const hours = new Array(24).fill(0);
  const veh: Record<string, number> = {};
  const viol: Record<string, number> = {};
  const stationCount: Record<string, number> = {};
  let violations = 0;
  let cis = 0;
  let nCells = 0;

  for (const c of cells) {
    if (haversineM(centerLat, centerLon, c.lat, c.lon) > radiusM) continue;
    nCells++;
    violations += c.n;
    cis += c.cis;
    stationCount[c.station] = (stationCount[c.station] || 0) + c.n;
    for (let h = 0; h < 24; h++) hours[h] += c.hours[h] || 0;
    for (const k in c.veh) veh[k] = (veh[k] || 0) + (c.veh[k as keyof typeof c.veh] || 0);
    for (const k in c.viol) viol[k] = (viol[k] || 0) + (c.viol[k as keyof typeof c.viol] || 0);
  }

  const peakViolations = hours.reduce((s, n, h) => (PEAK.has(h) ? s + n : s), 0);
  const topStation =
    Object.entries(stationCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  const hotspotsInside = hotspots
    .filter((h) => haversineM(centerLat, centerLon, h.lat, h.lon) <= radiusM)
    .sort((a, b) => b.priority_score - a.priority_score);
  const forecastInside = forecast
    .filter((z) => haversineM(centerLat, centerLon, z.lat, z.lon) <= radiusM)
    .sort((a, b) => b.risk_score - a.risk_score);

  return {
    cells: nCells,
    violations,
    cis,
    peakViolations,
    peakShare: violations ? peakViolations / violations : 0,
    hours,
    veh,
    viol,
    topStation,
    hotspotsInside,
    forecastInside,
    cityShare: cityTotalViolations ? violations / cityTotalViolations : 0,
    severity: classifyArea(hotspotsInside, cis, violations),
  };
}

/** sorted [key, value] pairs, descending */
export function sortedEntries(rec: Record<string, number>): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1]);
}
