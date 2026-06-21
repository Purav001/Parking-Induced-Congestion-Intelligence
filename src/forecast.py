"""
forecast.py — Patrol Forecast layer for GRID.

Turns the historical violation feed into a *proactive* risk layer: where illegal
parking is most likely to recur, whether it is heating up, and a recommended
patrol cadence — i.e. next week's patrol roster, not a rear-view report.

Honesty boundary:
  * WHERE risk concentrates is strongly forecastable. `backtest()` proves this live on
    held-out weeks at two grains it can reproduce: STATION (Spearman ~0.87, top-20 ~75%)
    and the raw 110m CELL proxy (~0.42, the conservative floor). The clustered ~400m
    ZONE figure (~0.68 / top-50 ~56%) comes from a separate one-off experiment, NOT from
    backtest() — see README section 4.4.
  * WHEN (exact day/hour) is NOT forecastable here — created_datetime is an enforcement
    *logging* time, so we output a recommended SHIFT WINDOW framed as a recorded-ticket
    slot (overnight ones flagged), never a precise "Tuesday 9am" claim.

Method (deterministic, no training, instant):
  risk(zone) = recency-weighted violation rate, log-compressed and min-max scaled
               to 0-100, then nudged up to +15% if the zone is strongly rising.
  Recency weight halves every FORECAST_HALFLIFE_DAYS (30d, backtest-optimal).

This module is imported and called *inside* the single `pipeline.py` run.
"""
from __future__ import annotations
from datetime import timedelta

import numpy as np
import pandas as pd

import weights as W


def _minmax(s: pd.Series) -> pd.Series:
    lo, hi = s.min(), s.max()
    if hi - lo < 1e-12:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


def _recency_weights(ts: pd.Series, ref_time, halflife: float) -> pd.Series:
    """Exponential decay: weight = 0.5 ** (age_days / halflife)."""
    age_days = (ref_time - ts).dt.total_seconds() / 86400.0
    return np.power(0.5, age_days / halflife)


def _shift_window(hours: pd.Series) -> dict:
    """Most active 3-hour logging window, returned WITH the logging-time caveat.

    We report this as a recommended enforcement *shift* derived from when
    violations are recorded — not a claim about when congestion peaks.
    """
    if hours.empty:
        return {"start": None, "end": None, "label": "n/a", "share": 0.0}
    counts = hours.value_counts()
    best_start, best_sum = 0, -1
    for start in range(24):
        window = [(start + k) % 24 for k in range(3)]
        s = int(counts.reindex(window).fillna(0).sum())
        if s > best_sum:
            best_sum, best_start = s, start
    end = (best_start + 3) % 24
    share = best_sum / len(hours)
    # EVERY window here is a *recorded-ticket* (logging) time, not measured congestion —
    # so the UI always frames it as such and never as a clean "deploy here" prediction.
    # We additionally grade how artifact-prone the window is:
    #   - "overnight" (22:00-05:00): implausible as real activity -> hard ⚠, do not deploy
    #   - "batch-band" (inside the documented 02:00-13:00 logging spike): soft caution
    #   - else: the most trustworthy slot available, still logging-derived
    if best_start >= 22 or best_start <= 5:
        skew = "overnight"
    elif 2 <= best_start <= 13:
        skew = "batch-band"
    else:
        skew = "ok"
    return {
        "start": int(best_start),
        "end": int(end),
        "label": f"{best_start:02d}:00–{end:02d}:00",
        "share": round(float(share), 3),
        "skew": skew,
        "logging_skewed": skew == "overnight",  # kept for back-compat
    }


def _trend(recent_n: float, prior_n: float):
    """(ratio, label) where label in Rising / Steady / Cooling.

    Compares like-length windows (both FORECAST_TREND_*_DAYS long) by raw count.
    A trend is only declared when both windows carry enough volume (MIN_RECENT /
    MIN_PRIOR) — otherwise low-traffic noise would masquerade as a dramatic swing,
    so such zones are reported "Steady".

    Backtest: a Rising flag persists into the future (~1.56x), so it is trusted and
    surfaced loudly. Cooling is ambiguous (~1.0x), so it is shown softly and never
    used to recommend stopping enforcement.
    """
    recent_rate = recent_n / W.FORECAST_TREND_RECENT_DAYS
    prior_rate = prior_n / W.FORECAST_TREND_PRIOR_DAYS
    if recent_n < W.FORECAST_TREND_MIN_RECENT or prior_n < W.FORECAST_TREND_MIN_PRIOR:
        # too little data to claim a direction
        ratio = (recent_rate / prior_rate) if prior_rate > 1e-9 else 1.0
        return ratio, "Steady"
    ratio = recent_rate / prior_rate
    if ratio >= W.FORECAST_TREND_RISING:
        return ratio, "Rising"
    if ratio <= W.FORECAST_TREND_FALLING:
        return ratio, "Cooling"
    return ratio, "Steady"


def build_forecast(df: pd.DataFrame, hs: pd.DataFrame, cell_to_cluster: dict) -> dict:
    """Compute the zone- and station-level patrol forecast.

    Args:
        df:  scored, cleaned records (must have ts, hour, cell_id, impact, etc.)
        hs:  the hotspot table from detect_hotspots (rank/priority/location/etc.)
        cell_to_cluster: mapping cell_id -> cluster_id (the same clusters as hs)
    Returns a dict ready to serialise (zones, stations, backtest, meta).
    """
    print("[5/7] Forecasting patrol risk ...")
    ref = df["ts"].max()
    halflife = W.FORECAST_HALFLIFE_DAYS

    # ---- attach cluster + recency weight to the hot records ----
    d = df[df["cell_id"].isin(cell_to_cluster)].copy()
    d["cluster"] = d["cell_id"].map(cell_to_cluster)
    d["w"] = _recency_weights(d["ts"], ref, halflife)

    rec_cut = ref - timedelta(days=W.FORECAST_TREND_RECENT_DAYS)
    prior_cut = rec_cut - timedelta(days=W.FORECAST_TREND_PRIOR_DAYS)

    # ---- per-zone aggregates ----
    g = d.groupby("cluster")
    z = pd.DataFrame({
        "weighted_rate": g["w"].sum(),
        "recent_n": g.apply(lambda x: int((x["ts"] >= rec_cut).sum()), include_groups=False),
        "prior_n": g.apply(
            lambda x: int(((x["ts"] >= prior_cut) & (x["ts"] < rec_cut)).sum()),
            include_groups=False),
    }).reset_index()

    # recency-weighted, log-compressed, scaled to 0-100
    z["base_risk"] = _minmax(np.log1p(z["weighted_rate"]))

    # trend nudge (only Rising adds; Cooling/Steady never penalise the score)
    ratios, labels = [], []
    for rn, pn in zip(z["recent_n"], z["prior_n"]):
        ratio, label = _trend(rn, pn)
        ratios.append(ratio)
        labels.append(label)
    z["trend_ratio"] = ratios
    z["trend"] = labels
    # bonus in [0, FORECAST_TREND_BONUS], scaled by how far past the rising threshold.
    # Gate on the LABEL, not the raw ratio: a low-volume zone the noise guard demoted
    # to "Steady" must get zero boost, otherwise a 3-vs-1 fluke would be lifted into a
    # higher patrol cadence exactly like a genuine surge.
    gated = np.array([min(r, 3.0) if lab == "Rising" else W.FORECAST_TREND_RISING
                      for r, lab in zip(ratios, labels)])
    rising_strength = np.clip(
        (gated - W.FORECAST_TREND_RISING) / (3.0 - W.FORECAST_TREND_RISING), 0, 1)
    z["risk_raw"] = z["base_risk"] * (1 + W.FORECAST_TREND_BONUS * rising_strength)
    z["risk_score"] = (_minmax(z["risk_raw"]) * 100).round(1)
    if len(z) and z["risk_score"].max() == 0:
        z.loc[z["weighted_rate"].idxmax(), "risk_score"] = 100.0
    z["risk_tier"] = z["risk_score"].apply(W.forecast_risk_tier)
    z["cadence_per_week"] = z["risk_tier"].map(W.FORECAST_CADENCE)

    # ---- enrich with the human-readable zone facts from hs ----
    hs_by_cluster = hs.set_index("cluster_id")
    shift_by_cluster = {cid: _shift_window(grp["hour"]) for cid, grp in d.groupby("cluster")}

    zones = []
    for _, r in z.iterrows():
        cid = int(r["cluster"])
        meta = hs_by_cluster.loc[cid] if cid in hs_by_cluster.index else None
        if meta is None:
            continue
        sw = shift_by_cluster.get(cid, {"label": "n/a", "start": None, "end": None, "share": 0})
        zones.append({
            "cluster_id": cid,
            "rank_enforcement": int(meta["rank"]),
            "lat": float(meta["lat"]),
            "lon": float(meta["lon"]),
            "risk_score": float(r["risk_score"]),
            "risk_tier": r["risk_tier"],
            "trend": r["trend"],
            "trend_ratio": (None if not np.isfinite(r["trend_ratio"])
                            else round(float(r["trend_ratio"]), 2)),
            "cadence_per_week": int(r["cadence_per_week"]),
            "recent_violations_21d": int(r["recent_n"]),
            "shift_window": sw["label"],
            "shift_share": sw["share"],
            "shift_skew": sw.get("skew", "ok"),
            "shift_skewed": sw.get("logging_skewed", False),
            "top_station": meta["top_station"],
            "top_junctions": list(meta["top_junctions"]) if meta["top_junctions"] is not None else [],
            "top_violations": meta["top_violations"],
            "sample_location": meta["sample_location"],
            "priority_tier": meta["priority_tier"],
            "priority_score": float(meta["priority_score"]),
        })
    zones.sort(key=lambda x: x["risk_score"], reverse=True)
    for i, zz in enumerate(zones):
        zz["forecast_rank"] = i + 1

    # ---- station-level forecast (the most forecastable unit, rho~0.87) ----
    df2 = df.copy()
    df2["w"] = _recency_weights(df2["ts"], ref, halflife)
    sg = df2.groupby("police_station")
    srate = sg["w"].sum()
    srecent = df2[df2["ts"] >= rec_cut].groupby("police_station").size()
    sprior = df2[(df2["ts"] >= prior_cut) & (df2["ts"] < rec_cut)].groupby("police_station").size()
    st = pd.DataFrame({"weighted_rate": srate}).reset_index()
    st["risk_score"] = (_minmax(np.log1p(st["weighted_rate"])) * 100).round(1)
    st["risk_tier"] = st["risk_score"].apply(W.forecast_risk_tier)
    strend = []
    for s in st["police_station"]:
        _, lab = _trend(float(srecent.get(s, 0)), float(sprior.get(s, 0)))
        strend.append(lab)
    st["trend"] = strend
    st = st.sort_values("risk_score", ascending=False).reset_index(drop=True)
    stations = st[["police_station", "risk_score", "risk_tier", "trend"]].to_dict(orient="records")

    # ---- weekly roster summary (operational headline) ----
    tier_counts = {t: int((z["risk_tier"] == t).sum()) for t in ["Critical", "High", "Medium", "Low"]}
    total_visits = int(sum(W.FORECAST_CADENCE[t] * c for t, c in tier_counts.items()))
    rising_zones = int((z["trend"] == "Rising").sum())

    bt = backtest(df)

    print(f"      {len(zones):,} zones scored. Rising={rising_zones}, "
          f"recommended patrol visits/week={total_visits}. "
          f"Backtest station recall@20={bt['station']['recall_at_20']:.0%}")

    return {
        "generated_ref_time": str(ref),
        "horizon_days": 14,
        "zones": zones,
        "stations": stations,
        "roster_summary": {
            "tier_counts": tier_counts,
            "cadence_per_week": W.FORECAST_CADENCE,
            "total_visits_per_week": total_visits,
            "rising_zones": rising_zones,
        },
        "backtest": bt,
        "method": {
            "halflife_days": halflife,
            "trend_recent_days": W.FORECAST_TREND_RECENT_DAYS,
            "trend_prior_days": W.FORECAST_TREND_PRIOR_DAYS,
            "note": ("Risk = recency-weighted (half-life 30d) violation rate, "
                     "log-scaled to 0-100, +up to 15% for strongly rising zones. "
                     "Forecasts WHERE risk concentrates; the shift window is derived "
                     "from enforcement-logging times and is a recommended patrol slot, "
                     "not a prediction of the exact hour congestion peaks."),
        },
    }


def backtest(df: pd.DataFrame, horizon_days: int = 14) -> dict:
    """Honest hold-out validation: train on all-but-last-`horizon_days`, predict
    the held-out window, and measure spatial skill at station & zone (cell-proxy)
    granularity. Powers the dashboard's "validated" banner.
    """
    t1 = df["ts"].max()
    test_start = t1 - timedelta(days=horizon_days)
    train = df[df["ts"] < test_start]
    test = df[df["ts"] >= test_start]
    ref = test_start

    def eval_key(key, kfor_recall=20):
        truth = test.groupby(key).size()
        w = _recency_weights(train["ts"], ref, W.FORECAST_HALFLIFE_DAYS)
        pred = train.assign(w=w).groupby(key)["w"].sum()
        idx = pred.index.union(truth.index)
        p = pred.reindex(idx).fillna(0)
        t = truth.reindex(idx).fillna(0)
        rho = float(p.corr(t, method="spearman")) if len(idx) > 2 else float("nan")
        out = {"spearman": round(rho, 3)}
        for K in (20, 50):
            topK = set(p.nlargest(K).index)
            out[f"recall_at_{K}"] = round(float(t[t.index.isin(topK)].sum() / max(t.sum(), 1)), 3)
        return out

    station = eval_key("police_station")
    # Finest-grain proxy = the 110m cell. We report it under an honest key: it is the
    # raw cell, NOT the clustered ~400m zone (which scores higher, ~0.68, but would
    # need re-clustering inside the backtest to measure reproducibly here). Keeping
    # the weakest number visible is deliberate — we never inflate the headline.
    cell_proxy = eval_key("cell_id")
    return {
        "horizon_days": horizon_days,
        "train_end": str(test_start.date()),
        "test_rows": int(len(test)),
        "station": station,
        "cell_proxy": cell_proxy,
        "headline": (f"Backtest: top-20 forecast divisions captured "
                     f"{station['recall_at_20']:.0%} of the next {horizon_days} days' "
                     f"violations (Spearman {station['spearman']})."),
    }
