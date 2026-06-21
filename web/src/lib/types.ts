// Shapes of web/public/data/grid.json (produced by src/pipeline.py).

export interface Kpis {
  total_violations: number;
  flow_affecting_violations: number;
  flow_affecting_pct: number;
  total_congestion_impact: number;
  grid_cells: number;
  hotspot_zones: number;
  critical_zones: number;
  high_zones: number;
  police_stations: number;
  junctions_involved: number;
  junction_violation_pct: number;
  peak_hour_pct: number;
  heavy_vehicle_pct: number;
}

export interface Summary {
  date_min: string;
  date_max: string;
  kpis: Kpis;
  impact_concentration: {
    top_1pct_cells_impact_share: number;
    top_5pct_cells_impact_share: number;
    top_10pct_cells_impact_share: number;
  };
  violation_distribution: { type: string; count: number; cis: number }[];
  vehicle_distribution: { vehicle_type: string; count: number; cis: number }[];
  hour_histogram: { hour: number; count: number }[];
  dow_histogram: { dow: number; count: number }[];
  stations: {
    police_station: string;
    violations: number;
    cis: number;
    peak_share: number;
    junction_share: number;
    heavy_share: number;
    hotspots: number;
  }[];
  weights_used: { peak_hours: number[]; [k: string]: unknown };
}

export interface Hotspot {
  cluster_id: number;
  rank: number;
  lat: number;
  lon: number;
  cis: number;
  violations: number;
  distinct_days: number;
  n_cells: number;
  recent_violations: number;
  peak_share: number;
  heavy_vehicle_share: number;
  junction_share: number;
  top_station: string;
  top_junctions: string[];
  top_violations: { type: string; count: number }[];
  top_vehicles: { type: string; count: number }[];
  peak_hours: number[];
  sample_location: string;
  priority_score: number;
  priority_tier: Tier;
}

export type Tier = "Critical" | "High" | "Medium" | "Low";
export type Trend = "Rising" | "Cooling" | "Steady";
export type ShiftSkew = "overnight" | "batch-band" | "ok";

export interface ForecastZone {
  cluster_id: number;
  forecast_rank: number;
  rank_enforcement: number;
  lat: number;
  lon: number;
  risk_score: number;
  risk_tier: Tier;
  trend: Trend;
  trend_ratio: number | null;
  cadence_per_week: number;
  recent_violations_21d: number;
  shift_window: string;
  shift_share: number;
  shift_skew: ShiftSkew;
  shift_skewed: boolean;
  top_station: string;
  top_junctions: string[];
  top_violations: { type: string; count: number }[];
  sample_location: string;
  priority_tier: Tier;
  priority_score: number;
}

export interface Forecast {
  generated_ref_time: string;
  horizon_days: number;
  zones: ForecastZone[];
  stations: { police_station: string; risk_score: number; risk_tier: Tier; trend: Trend }[];
  roster_summary: {
    tier_counts: Record<Tier, number>;
    cadence_per_week: Record<Tier, number>;
    total_visits_per_week: number;
    rising_zones: number;
  };
  backtest: {
    horizon_days: number;
    train_end: string;
    test_rows: number;
    station: { spearman: number; recall_at_20: number; recall_at_50: number };
    cell_proxy: { spearman: number; recall_at_20: number; recall_at_50: number };
    headline: string;
  };
  method: { halflife_days: number; note: string; [k: string]: unknown };
}

export interface Cell {
  id: string;
  lat: number;
  lon: number;
  n: number; // violations
  cis: number;
  days: number;
  station: string;
  hours: number[]; // length 24
  veh: Partial<Record<"twoWheeler" | "auto" | "car" | "lcv" | "heavy", number>>;
  viol: Partial<
    Record<"wrong" | "noParking" | "mainRoad" | "footpath" | "double" | "crossing" | "busstop" | "other", number>
  >;
}

export interface GridData {
  summary: Summary;
  hotspots: Hotspot[];
  forecast: Forecast;
  cells: Cell[];
}

export const TIER_COLOR: Record<Tier, string> = {
  Critical: "#ff4d5e",
  High: "#ff9f1c",
  Medium: "#ffd166",
  Low: "#4cc9a0",
};

export const VIOL_LABEL: Record<string, string> = {
  wrong: "Wrong parking",
  noParking: "No parking",
  mainRoad: "Parking on main road",
  footpath: "Footpath parking",
  double: "Double parking",
  crossing: "Near crossing / signal",
  busstop: "Near bus stop / school",
  other: "Other",
};

export const VEH_LABEL: Record<string, string> = {
  twoWheeler: "Two-wheeler",
  auto: "Auto",
  car: "Car / van",
  lcv: "Light goods (LCV)",
  heavy: "Bus / heavy (HGV)",
};
