"""
pipeline.py — Parking-Induced Congestion Intelligence engine.

Turns the raw police parking-violation CSV into decision-ready artifacts:

  output/
    hotspots.json        ranked congestion hotspot zones (the worklist)
    grid_cells.json      every ~110m cell w/ CIS (powers the heatmap)
    summary.json         city-wide KPIs, distributions, leaderboards
    station_summary.json per-police-station rollups
    records_sample.json  a sample of scored raw points (for the map's detail layer)
    forecast.json        patrol-forecast risk layer + roster + backtest
    cell_details.json    per-cell hour/violation/vehicle breakdowns (pin-drop analytics)

It also writes the lean bundle the React front-end consumes:
    web/public/data/grid.json   (summary + hotspots + forecast + cells)

Run:  python src/pipeline.py "jan to may police violation_anonymized791b166.csv"

Design goals: deterministic, transparent (all weights in weights.py), and fast
enough to re-run on the full ~300k-row file in a few seconds with pure pandas.
"""
from __future__ import annotations
import sys, json, ast, math, os
from collections import defaultdict
from datetime import timedelta

import numpy as np
import pandas as pd

# allow `python src/pipeline.py` from repo root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weights as W
import forecast as forecast_mod


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_list(x):
    """offence/violation columns are stringified JSON lists like '[\"NO PARKING\"]'."""
    if isinstance(x, list):
        return x
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = ast.literal_eval(x)
        return v if isinstance(v, list) else [v]
    except (ValueError, SyntaxError):
        return []


def _haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres between two arrays/points of coords."""
    rlat1, rlat2 = np.radians(lat1), np.radians(lat2)
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(rlat1) * np.cos(rlat2) * np.sin(dlon / 2) ** 2
    return W.EARTH_RADIUS_M * 2 * np.arcsin(np.sqrt(a))


def _minmax(s: pd.Series) -> pd.Series:
    """Min-max normalise to [0,1]; flat series -> all zeros."""
    lo, hi = s.min(), s.max()
    if hi - lo < 1e-12:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


# ---------------------------------------------------------------------------
# 1. Load + clean
# ---------------------------------------------------------------------------
def load_and_clean(path: str) -> pd.DataFrame:
    print(f"[1/7] Loading {path} ...")
    df = pd.read_csv(path, low_memory=False)
    n0 = len(df)

    # timestamps -> IST (data is UTC). created_datetime drives temporal analysis.
    df["ts_utc"] = pd.to_datetime(df["created_datetime"], utc=True, errors="coerce")
    df = df[df["ts_utc"].notna()].copy()
    df["ts"] = df["ts_utc"].dt.tz_convert("Asia/Kolkata")

    # geo sanity: numeric + inside the Bengaluru bounding box
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    in_box = (
        df["latitude"].between(W.BBOX["lat_min"], W.BBOX["lat_max"])
        & df["longitude"].between(W.BBOX["lon_min"], W.BBOX["lon_max"])
    )
    dropped_geo = int((~in_box).sum())
    df = df[in_box].copy()

    # parse the multi-violation columns once
    df["violations"] = df["violation_type"].apply(_parse_list)

    # Drop reviewed-and-rejected / duplicate tickets so they don't inflate hotspots.
    # NULL validation_status (unreviewed) is kept — no review != a rejection.
    vstat = df["validation_status"].astype("string").str.lower()
    rejected_mask = vstat.isin(W.EXCLUDE_VALIDATION_STATUS)
    dropped_validation = int(rejected_mask.sum())
    df = df[~rejected_mask].copy()

    df["police_station"] = df["police_station"].fillna("Unknown")
    df["junction_name"] = df["junction_name"].fillna(W.NO_JUNCTION_LABEL)

    print(f"      kept {len(df):,} / {n0:,} rows "
          f"(dropped {dropped_geo:,} out-of-box/bad-geo, "
          f"{dropped_validation:,} rejected/duplicate, "
          f"{n0 - len(df) - dropped_geo - dropped_validation:,} bad timestamp)")
    return df


# ---------------------------------------------------------------------------
# 2. Per-record congestion impact
# ---------------------------------------------------------------------------
def score_records(df: pd.DataFrame) -> pd.DataFrame:
    print("[2/7] Scoring per-record congestion impact ...")

    # severity = max severity among the (possibly multiple) violations on a record
    def rec_severity(vlist):
        if not vlist:
            return W.DEFAULT_SEVERITY
        return max(W.SEVERITY_WEIGHTS.get(v, W.DEFAULT_SEVERITY) for v in vlist)

    # the single most-severe violation label drives the record's category
    def primary_violation(vlist):
        if not vlist:
            return "UNKNOWN"
        return max(vlist, key=lambda v: W.SEVERITY_WEIGHTS.get(v, W.DEFAULT_SEVERITY))

    df["severity_w"] = df["violations"].apply(rec_severity)
    df["primary_violation"] = df["violations"].apply(primary_violation)
    df["vehicle_pcu"] = df["vehicle_type"].map(W.VEHICLE_PCU).fillna(W.DEFAULT_PCU)

    df["hour"] = df["ts"].dt.hour
    df["dow"] = df["ts"].dt.dayofweek
    df["date"] = df["ts"].dt.date
    df["time_w"] = df["hour"].apply(W.time_weight_for_hour)

    df["on_junction"] = df["junction_name"].ne(W.NO_JUNCTION_LABEL)
    df["junction_w"] = np.where(df["on_junction"], W.JUNCTION_WEIGHT, W.NO_JUNCTION_WEIGHT)

    df["impact"] = df["severity_w"] * df["vehicle_pcu"] * df["time_w"] * df["junction_w"]

    # spatial grid cell key
    df["cell_lat"] = df["latitude"].round(W.GRID_DECIMALS)
    df["cell_lon"] = df["longitude"].round(W.GRID_DECIMALS)
    df["cell_id"] = (df["cell_lat"].astype(str) + "," + df["cell_lon"].astype(str))

    print(f"      mean impact={df['impact'].mean():.3f}  "
          f"total impact={df['impact'].sum():,.0f}")
    return df


# ---------------------------------------------------------------------------
# 3. Grid cells (heatmap substrate)
# ---------------------------------------------------------------------------
def build_grid(df: pd.DataFrame) -> pd.DataFrame:
    print("[3/7] Aggregating spatial grid cells ...")
    g = df.groupby("cell_id")
    cells = pd.DataFrame({
        "lat": g["latitude"].mean(),
        "lon": g["longitude"].mean(),
        "violations": g.size(),
        "cis": g["impact"].sum(),
        "distinct_days": g["date"].nunique(),
        "peak_share": g.apply(
            lambda x: float((x["hour"].isin(W.PEAK_HOURS)).mean()), include_groups=False
        ),
        "heavy_share": g.apply(
            lambda x: float((x["vehicle_pcu"] >= 1.5).mean()), include_groups=False
        ),
        "junction_share": g["on_junction"].mean(),
        "top_station": g["police_station"].agg(lambda s: s.mode().iat[0] if len(s) else "Unknown"),
    }).reset_index()
    cells = cells.sort_values("cis", ascending=False).reset_index(drop=True)
    if cells.empty:
        print("      no grid cells — input is empty after cleaning.")
        return cells
    print(f"      {len(cells):,} grid cells (~110m). "
          f"top cell CIS={cells['cis'].iloc[0]:,.0f} ({cells['violations'].iloc[0]} violations)")
    return cells


# ---------------------------------------------------------------------------
# 3b. Per-cell breakdowns (powers the pin-drop "analyse any area" feature)
# ---------------------------------------------------------------------------
# Compact buckets so any radius the user draws can be summed EXACTLY on the client
# from the cells inside it (cells already partition every violation, ~110 m each).
VEHICLE_BUCKETS = {
    "SCOOTER": "twoWheeler", "MOTOR CYCLE": "twoWheeler", "MOPED": "twoWheeler",
    "PASSENGER AUTO": "auto", "GOODS AUTO": "auto",
    "CAR": "car", "JEEP": "car", "VAN": "car", "MAXI-CAB": "car", "OTHERS": "car",
    "LGV": "lcv", "TEMPO": "lcv", "MINI LORRY": "lcv",
    "PRIVATE BUS": "heavy", "BUS (BMTC/KSRTC)": "heavy", "TOURIST BUS": "heavy",
    "SCHOOL VEHICLE": "heavy", "FACTORY BUS": "heavy",
    "LORRY/GOODS VEHICLE": "heavy", "HGV": "heavy", "TANKER": "heavy", "TRACTOR": "heavy",
}
VIOLATION_BUCKETS = {
    "WRONG PARKING": "wrong", "NO PARKING": "noParking",
    "PARKING IN A MAIN ROAD": "mainRoad", "PARKING ON FOOTPATH": "footpath",
    "DOUBLE PARKING": "double",
    "PARKING NEAR ROAD CROSSING": "crossing",
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": "crossing",
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": "busstop",
}


def build_cell_details(df: pd.DataFrame, cells: pd.DataFrame) -> list:
    """Attach hour histogram + violation/vehicle bucket counts to each cell.

    Vectorised via crosstabs so it stays fast on ~250k rows / ~7k cells.
    """
    print("      enriching cells with hour/violation/vehicle breakdowns ...")
    veh_bucket = df["vehicle_type"].map(VEHICLE_BUCKETS).fillna("car")
    viol_bucket = df["primary_violation"].map(VIOLATION_BUCKETS).fillna("other")

    hours = pd.crosstab(df["cell_id"], df["hour"]).reindex(columns=range(24), fill_value=0)
    veh = pd.crosstab(df["cell_id"], veh_bucket)
    viol = pd.crosstab(df["cell_id"], viol_bucket)

    out = []
    for _, c in cells.iterrows():
        cid = c["cell_id"]
        hrow = hours.loc[cid] if cid in hours.index else None
        vrow = veh.loc[cid] if cid in veh.index else None
        prow = viol.loc[cid] if cid in viol.index else None
        out.append({
            "id": cid,
            "lat": round(float(c["lat"]), 5),
            "lon": round(float(c["lon"]), 5),
            "n": int(c["violations"]),
            "cis": round(float(c["cis"]), 1),
            "days": int(c["distinct_days"]),
            "station": c["top_station"],
            "hours": [int(x) for x in (hrow.tolist() if hrow is not None else [0] * 24)],
            "veh": {k: int(v) for k, v in (vrow.to_dict().items() if vrow is not None else {})},
            "viol": {k: int(v) for k, v in (prow.to_dict().items() if prow is not None else {})},
        })
    return out


# ---------------------------------------------------------------------------
# 4. Hotspot clustering (leader/canopy grouping of hot cells)
# ---------------------------------------------------------------------------
def detect_hotspots(cells: pd.DataFrame, df: pd.DataFrame) -> "tuple[pd.DataFrame, dict]":
    print("[4/7] Detecting & clustering hotspot zones ...")
    threshold = np.percentile(cells["cis"], W.HOT_CELL_PERCENTILE)
    hot = cells[cells["cis"] >= threshold].sort_values("cis", ascending=False).reset_index(drop=True)
    print(f"      {len(hot):,} hot cells (CIS >= P{W.HOT_CELL_PERCENTILE}={threshold:,.1f})")

    # ---- Leader / canopy clustering ----
    # Single-linkage chains all of dense central Bengaluru into one useless blob.
    # Instead we seed each zone at the highest-CIS unassigned cell and absorb every
    # unassigned hot cell within HOTSPOT_RADIUS_M of that seed. This guarantees:
    #   * each zone is a tight disk (<= 2*radius across) -> a real, patrollable area
    #   * seeds are local CIS peaks -> zones are ranked by genuine intensity
    #   * no chaining -> distinct, separable enforcement targets
    lats = hot["lat"].to_numpy()
    lons = hot["lon"].to_numpy()
    cluster = np.full(len(hot), -1, dtype=int)
    next_id = 0
    for i in range(len(hot)):
        if cluster[i] != -1:
            continue
        # i is the highest-CIS still-unassigned cell -> new seed
        d = _haversine_m(lats[i], lons[i], lats, lons)
        mask = (cluster == -1) & (d <= W.HOTSPOT_RADIUS_M)
        cluster[mask] = next_id
        next_id += 1
    hot["cluster"] = cluster

    # Map every hot cell_id -> cluster, then pull the underlying records per cluster
    cell_to_cluster = dict(zip(hot["cell_id"], hot["cluster"]))
    df_hot = df[df["cell_id"].isin(cell_to_cluster)].copy()
    df_hot["cluster"] = df_hot["cell_id"].map(cell_to_cluster)

    recent_cut = df["ts"].max() - timedelta(days=W.RECENCY_WINDOW_DAYS)

    rows = []
    for cid, grp in df_hot.groupby("cluster"):
        viol_counts = grp["primary_violation"].value_counts()
        veh_counts = grp["vehicle_type"].value_counts()
        # weight the zone centroid toward high-impact points
        wlat = float((grp["latitude"] * grp["impact"]).sum() / grp["impact"].sum())
        wlon = float((grp["longitude"] * grp["impact"]).sum() / grp["impact"].sum())
        junctions = sorted(set(grp.loc[grp["on_junction"], "junction_name"]))
        rows.append({
            "cluster_id": int(cid),
            "lat": wlat,
            "lon": wlon,
            "cis": float(grp["impact"].sum()),
            "violations": int(len(grp)),
            "distinct_days": int(grp["date"].nunique()),
            "n_cells": int(grp["cell_id"].nunique()),
            "recent_violations": int((grp["ts"] >= recent_cut).sum()),
            "peak_share": float(grp["hour"].isin(W.PEAK_HOURS).mean()),
            "heavy_vehicle_share": float((grp["vehicle_pcu"] >= 1.5).mean()),
            "junction_share": float(grp["on_junction"].mean()),
            "top_station": grp["police_station"].mode().iat[0],
            "top_junctions": junctions[:3],
            "top_violations": [{"type": k, "count": int(v)} for k, v in viol_counts.head(4).items()],
            "top_vehicles": [{"type": k, "count": int(v)} for k, v in veh_counts.head(4).items()],
            "peak_hours": [int(h) for h in grp["hour"].value_counts().head(3).index.tolist()],
            "sample_location": grp["location"].dropna().iloc[0] if grp["location"].notna().any() else "",
        })

    hs = pd.DataFrame(rows)

    # ---- Enforcement Priority Score (0-100) ----
    # CIS is heavy-tailed (one mega-zone dwarfs the rest), so a raw min-max would
    # squash every other zone to ~0. Log-compress impact before normalising so the
    # score discriminates across the whole worklist, not just the #1 outlier.
    hs["n_impact"] = _minmax(np.log1p(hs["cis"]))
    hs["n_persist"] = _minmax(hs["distinct_days"])
    hs["n_recency"] = _minmax(hs["recent_violations"])
    hs["priority_raw"] = (
        W.PRIORITY_BLEND["impact"] * hs["n_impact"]
        + W.PRIORITY_BLEND["persistence"] * hs["n_persist"]
        + W.PRIORITY_BLEND["recency"] * hs["n_recency"]
    )
    hs["priority_score"] = (hs["priority_raw"] * 100).round(1)
    # Degenerate worklist guard: with one zone (or all zones tied) every min-max
    # column is 0, so priority_raw collapses to 0 and the lone real hotspot would
    # wrongly read "Low". Anchor the top zone to 100 so the worklist stays sane.
    if len(hs) and hs["priority_score"].max() == 0:
        hs.loc[hs["cis"].idxmax(), "priority_score"] = 100.0
    hs["priority_tier"] = hs["priority_score"].apply(W.priority_tier)
    hs = hs.sort_values("priority_score", ascending=False).reset_index(drop=True)
    hs["rank"] = hs.index + 1

    print(f"      {len(hs):,} hotspot zones. "
          f"Critical={int((hs['priority_tier']=='Critical').sum())}, "
          f"High={int((hs['priority_tier']=='High').sum())}")
    # cell_to_cluster is reused by the forecast layer to score the same zones.
    return hs, cell_to_cluster


# ---------------------------------------------------------------------------
# 5. City-wide + station summaries
# ---------------------------------------------------------------------------
def build_summaries(df: pd.DataFrame, cells: pd.DataFrame, hs: pd.DataFrame) -> dict:
    print("[6/7] Building summaries ...")

    flow_affecting = df["severity_w"] >= 1.0  # parking violations that obstruct traffic

    # station rollup
    g = df.groupby("police_station")
    stations = pd.DataFrame({
        "violations": g.size(),
        "cis": g["impact"].sum(),
        "peak_share": g["hour"].apply(lambda x: float(x.isin(W.PEAK_HOURS).mean())),
        "junction_share": g["on_junction"].mean(),
        "heavy_share": g["vehicle_pcu"].apply(lambda x: float((x >= 1.5).mean())),
    }).reset_index().sort_values("cis", ascending=False)
    # how many hotspots fall in each station
    hs_per_station = hs["top_station"].value_counts().to_dict()
    stations["hotspots"] = stations["police_station"].map(hs_per_station).fillna(0).astype(int)
    station_records = stations.round(3).to_dict(orient="records")

    # primary-violation distribution (flow-affecting categories that matter)
    viol_dist = (
        df.groupby("primary_violation")
        .agg(count=("impact", "size"), cis=("impact", "sum"))
        .sort_values("cis", ascending=False)
        .reset_index()
        .rename(columns={"primary_violation": "type"})
    )
    viol_records = viol_dist.round(1).to_dict(orient="records")

    hour_hist = df["hour"].value_counts().sort_index()
    dow_hist = df["dow"].value_counts().sort_index()
    veh_dist = (
        df.groupby("vehicle_type")
        .agg(count=("impact", "size"), cis=("impact", "sum"))
        .sort_values("cis", ascending=False).reset_index()
        .round(1).to_dict(orient="records")
    )

    summary = {
        "generated_from": "police parking-violation feed (Bengaluru)",
        "date_min": str(df["ts"].min()),
        "date_max": str(df["ts"].max()),
        "kpis": {
            "total_violations": int(len(df)),
            "flow_affecting_violations": int(flow_affecting.sum()),
            "flow_affecting_pct": round(100 * flow_affecting.mean(), 1),
            "total_congestion_impact": round(float(df["impact"].sum()), 0),
            "grid_cells": int(len(cells)),
            "hotspot_zones": int(len(hs)),
            "critical_zones": int((hs["priority_tier"] == "Critical").sum()),
            "high_zones": int((hs["priority_tier"] == "High").sum()),
            "police_stations": int(df["police_station"].nunique()),
            "junctions_involved": int(df.loc[df["on_junction"], "junction_name"].nunique()),
            "junction_violation_pct": round(100 * df["on_junction"].mean(), 1),
            "peak_hour_pct": round(100 * df["hour"].isin(W.PEAK_HOURS).mean(), 1),
            "heavy_vehicle_pct": round(100 * (df["vehicle_pcu"] >= 1.5).mean(), 1),
        },
        # concentration: what share of total impact sits in the top 10% of cells?
        "impact_concentration": {
            "top_1pct_cells_impact_share": _impact_share(cells, 0.01),
            "top_5pct_cells_impact_share": _impact_share(cells, 0.05),
            "top_10pct_cells_impact_share": _impact_share(cells, 0.10),
        },
        "violation_distribution": viol_records,
        "vehicle_distribution": veh_dist,
        "hour_histogram": [{"hour": int(h), "count": int(c)} for h, c in hour_hist.items()],
        "dow_histogram": [{"dow": int(d), "count": int(c)} for d, c in dow_hist.items()],
        "stations": station_records,
        "weights_used": {
            "severity": W.SEVERITY_WEIGHTS,
            "vehicle_pcu": W.VEHICLE_PCU,
            "time": W.TIME_WEIGHTS,
            "peak_hours": sorted(W.PEAK_HOURS),
            "junction_multiplier": W.JUNCTION_WEIGHT,
            "priority_blend": W.PRIORITY_BLEND,
            "grid_decimals": W.GRID_DECIMALS,
            "hot_cell_percentile": W.HOT_CELL_PERCENTILE,
        },
    }
    return summary


def _impact_share(cells: pd.DataFrame, frac: float) -> float:
    """Share of total CIS held by the top `frac` of cells (by CIS)."""
    n = max(1, int(len(cells) * frac))
    top = cells.nlargest(n, "cis")["cis"].sum()
    return round(100 * top / cells["cis"].sum(), 1)


# ---------------------------------------------------------------------------
# 6. Write outputs
# ---------------------------------------------------------------------------
def write_outputs(df, cells, hs, summary, forecast, cell_details=None, outdir="output"):
    print("[7/7] Writing outputs ...")
    os.makedirs(outdir, exist_ok=True)

    with open(f"{outdir}/summary.json", "w") as f:
        json.dump(summary, f, indent=2, default=str)

    with open(f"{outdir}/station_summary.json", "w") as f:
        json.dump(summary["stations"], f, indent=2, default=str)

    # grid cells -> compact heatmap payload (round to keep file small)
    cells_out = cells.copy()
    cells_out["cis"] = cells_out["cis"].round(1)
    cells_out["peak_share"] = cells_out["peak_share"].round(3)
    cells_out["heavy_share"] = cells_out["heavy_share"].round(3)
    cells_out["junction_share"] = cells_out["junction_share"].round(3)
    cells_out["lat"] = cells_out["lat"].round(5)
    cells_out["lon"] = cells_out["lon"].round(5)
    with open(f"{outdir}/grid_cells.json", "w") as f:
        json.dump(cells_out.to_dict(orient="records"), f, default=str)

    # hotspots (drop internal normalisation columns)
    hs_out = hs.drop(columns=["n_impact", "n_persist", "n_recency", "priority_raw"])
    for c in ("lat", "lon"):
        hs_out[c] = hs_out[c].round(6)
    hs_out["cis"] = hs_out["cis"].round(1)
    with open(f"{outdir}/hotspots.json", "w") as f:
        json.dump(hs_out.to_dict(orient="records"), f, indent=2, default=str)

    # a sample of scored raw points for the map's detail layer (cap to keep light)
    cols = ["latitude", "longitude", "primary_violation", "vehicle_type",
            "police_station", "junction_name", "impact", "hour", "on_junction"]
    sample = df.nlargest(6000, "impact")[cols].copy()
    sample["impact"] = sample["impact"].round(2)
    sample["latitude"] = sample["latitude"].round(5)
    sample["longitude"] = sample["longitude"].round(5)
    with open(f"{outdir}/records_sample.json", "w") as f:
        json.dump(sample.to_dict(orient="records"), f, default=str)

    # patrol forecast (proactive risk layer + roster)
    with open(f"{outdir}/forecast.json", "w") as f:
        json.dump(forecast, f, indent=2, default=str)

    # per-cell breakdowns (powers the pin-drop "analyse any area" feature)
    if cell_details is not None:
        with open(f"{outdir}/cell_details.json", "w") as f:
            json.dump(cell_details, f, default=str)

    # --- sync the React site's data bundle (web/public/data/grid.json) ---
    # The React app (web/) is the front-end; it aggregates area analytics from
    # `cells`, so the heavy raw `records` sample is not bundled — kept lean.
    web_data = os.path.join("web", "public", "data")
    if os.path.isdir("web"):
        os.makedirs(web_data, exist_ok=True)
        web_bundle = {
            "summary": summary,
            "hotspots": hs_out.to_dict(orient="records"),
            "forecast": forecast,
            "cells": cell_details if cell_details is not None else [],
        }
        with open(os.path.join(web_data, "grid.json"), "w") as f:
            json.dump(web_bundle, f, default=str, separators=(",", ":"))

    sizes = {p: os.path.getsize(f"{outdir}/{p}")
             for p in os.listdir(outdir) if p.endswith(".json")}
    if os.path.exists(os.path.join(web_data, "grid.json")):
        sizes["web/public/data/grid.json"] = os.path.getsize(os.path.join(web_data, "grid.json"))
    for p, s in sorted(sizes.items()):
        label = p if ("/" in p) else f"{outdir}/{p}"
        print(f"      {label:34s} {s/1024:8.1f} KB")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "jan to may police violation_anonymized791b166.csv"
    df = load_and_clean(path)
    df = score_records(df)
    cells = build_grid(df)
    cell_details = build_cell_details(df, cells)
    hs, cell_to_cluster = detect_hotspots(cells, df)
    forecast = forecast_mod.build_forecast(df, hs, cell_to_cluster)
    summary = build_summaries(df, cells, hs)
    write_outputs(df, cells, hs, summary, forecast, cell_details)
    print("\nDone. Data synced to web/public/data/grid.json — run the web app (cd web && npm run dev).")


if __name__ == "__main__":
    main()
