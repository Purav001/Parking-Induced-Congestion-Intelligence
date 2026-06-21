"""
weights.py — Transparent, tunable scoring configuration for the
Parking-Induced Congestion Intelligence prototype.

Everything that turns a raw violation row into a *traffic-flow-impact* number
lives here so it can be audited and re-tuned by a traffic engineer without
touching pipeline logic.

The core model:

    record_impact = severity_w x vehicle_pcu x time_w x junction_w

  - severity_w  : how much this *type* of parking violation chokes the carriageway
  - vehicle_pcu : how much road space the vehicle occupies (Passenger Car Units)
  - time_w      : congestion sensitivity of the hour the violation occurred
  - junction_w  : multiplier when the violation sits on a signalised junction

A hotspot's Congestion Impact Score (CIS) is the sum of record_impact over all
records inside it, so it rewards BOTH frequency and per-event severity — a spot
with many bus/footpath/double-parking events at a junction during peak hour
outranks a spot with more, but milder, off-peak two-wheeler tickets.
"""

# ---------------------------------------------------------------------------
# 1. Violation severity — carriageway / intersection blocking impact
# ---------------------------------------------------------------------------
# Grounded in how each manoeuvre obstructs moving traffic. Values are relative
# multipliers centred on ~1.0 for a "standard" parking violation.
# Non-flow-affecting offences (number plate, black film, helmet, fare refusal)
# are kept at a near-zero weight so they don't pollute a *congestion* score
# while still being counted for completeness.
SEVERITY_WEIGHTS = {
    "DOUBLE PARKING": 1.8,                              # blocks a live lane outright
    "PARKING IN A MAIN ROAD": 1.7,                      # chokes an arterial carriageway
    "PARKING NEAR ROAD CROSSING": 1.6,                  # blocks intersection approach
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 1.6,   # cuts signalised throughput
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE": 1.5,  # narrows road to single lane
    "PARKING ON FOOTPATH": 1.4,                         # pushes pedestrians into traffic
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 1.4,     # high-churn pickup conflict
    "PARKING OTHER THAN BUS STOP": 1.2,                 # blocks bus bay / kerb
    "WRONG PARKING": 1.2,                               # generic obstructive parking
    "NO PARKING": 1.0,                                  # baseline parking violation
    # --- non-flow-affecting (kept, but heavily down-weighted) ---
    "DEFECTIVE NUMBER PLATE": 0.15,
    "USING BLACK FILM/OTHER MATERIALS": 0.15,
    "WITHOUT SIDE MIRROR": 0.15,
    "REFUSE TO GO FOR HIRE": 0.15,
    "DEMANDING EXCESS FARE": 0.15,
    "H T V PROHIBITED": 0.6,                            # heavy vehicle in restricted zone
    "AGAINST ONE WAY/NO ENTRY": 0.8,
    "OBSTRUCTING DRIVER": 0.4,
    "VIOLATING LANE DISIPLINE": 0.5,
    "JUMPING TRAFFIC SIGNAL": 0.5,
}
DEFAULT_SEVERITY = 0.3  # anything unmapped (helmet, seatbelt, mobile, etc.)


# ---------------------------------------------------------------------------
# 2. Vehicle footprint — Passenger Car Unit (PCU) equivalents
# ---------------------------------------------------------------------------
# Approximate IRC (Indian Roads Congress) PCU factors: a parked bus or lorry
# removes far more carriageway capacity than a parked two-wheeler.
VEHICLE_PCU = {
    "SCOOTER": 0.5, "MOTOR CYCLE": 0.5, "MOPED": 0.5,
    "PASSENGER AUTO": 0.8, "GOODS AUTO": 0.8,
    "CAR": 1.0, "JEEP": 1.0, "VAN": 1.0, "MAXI-CAB": 1.0, "OTHERS": 1.0,
    "LGV": 1.5, "TEMPO": 1.5, "MINI LORRY": 1.5,
    "PRIVATE BUS": 3.0, "BUS (BMTC/KSRTC)": 3.0, "TOURIST BUS": 3.0,
    "SCHOOL VEHICLE": 3.0, "FACTORY BUS": 3.0,
    "LORRY/GOODS VEHICLE": 3.5, "HGV": 3.5, "TANKER": 3.5, "TRACTOR": 2.5,
}
DEFAULT_PCU = 1.0


# ---------------------------------------------------------------------------
# 3. Time-of-day congestion sensitivity (hour in IST, 0-23)
# ---------------------------------------------------------------------------
# A blockage during peak flow costs far more vehicle-hours than one at night.
# NOTE: created_datetime reflects when the patrol *logged* the ticket, which is
# itself patrol-shift-biased; this weight encodes the congestion cost of the
# clock hour, and the bias is documented as a known limitation in the README.
# NOTE: in THIS dataset almost all activity is logged 02:00-13:00 (patrol-shift
# logging), so the evening block (17-20) is near-empty here. It is retained because
# the weight encodes the *congestion cost* of the hour for a general feed; with a
# trustworthy timestamp these windows should be re-derived from the diurnal curve.
PEAK_HOURS     = {8, 9, 10, 11, 17, 18, 19, 20}   # typical AM + PM urban rush
SHOULDER_HOURS = {7, 12, 13, 16, 21}
TIME_WEIGHTS = {"peak": 1.5, "shoulder": 1.2, "offpeak": 0.8}


def time_weight_for_hour(hour: int) -> float:
    if hour in PEAK_HOURS:
        return TIME_WEIGHTS["peak"]
    if hour in SHOULDER_HOURS:
        return TIME_WEIGHTS["shoulder"]
    return TIME_WEIGHTS["offpeak"]


# ---------------------------------------------------------------------------
# 4. Junction proximity multiplier
# ---------------------------------------------------------------------------
# A violation sitting on a signalised junction degrades intersection capacity,
# which propagates congestion far upstream — worth more than a mid-block event.
JUNCTION_WEIGHT = 1.4
NO_JUNCTION_WEIGHT = 1.0
NO_JUNCTION_LABEL = "No Junction"


# ---------------------------------------------------------------------------
# 5. Spatial gridding & hotspot clustering
# ---------------------------------------------------------------------------
# Grid cell = coordinates rounded to GRID_DECIMALS. At Bengaluru's latitude,
# 3 decimals ~= 110 m cells — a city-block scale appropriate for kerbside
# enforcement zones.
GRID_DECIMALS = 3

# Bengaluru bounding box — rows outside this are GPS errors / out-of-jurisdiction.
BBOX = {"lat_min": 12.70, "lat_max": 13.30, "lon_min": 77.30, "lon_max": 77.90}

# Validation filter: a tagged record can be reviewed and rejected (~17% of the
# feed is rejected/duplicate). Counting rejected tickets would inflate hotspots
# and misdirect patrols, so we drop them. Unreviewed records (validation_status
# is NULL) are KEPT — absence of review is not a rejection.
EXCLUDE_VALIDATION_STATUS = {"rejected", "duplicate"}

# A "hot cell" qualifies as a hotspot seed if its CIS is in the top
# HOT_CELL_PERCENTILE of all cells. Hot cells are then grouped into compact zones
# by leader/canopy clustering: each zone is seeded at the highest-CIS unassigned
# cell and absorbs every unassigned hot cell within HOTSPOT_RADIUS_M. This keeps
# every zone a tight, patrollable disk instead of one chained city-wide blob.
HOT_CELL_PERCENTILE = 90          # top 10% of cells by CIS
HOTSPOT_RADIUS_M = 200.0          # zone radius around each CIS-peak seed
EARTH_RADIUS_M = 6_371_000.0


# ---------------------------------------------------------------------------
# 6. Enforcement Priority Score (0-100) blend
# ---------------------------------------------------------------------------
# Priority = how badly a zone needs targeted enforcement. Blends:
#   - impact      : normalised CIS (the congestion damage)
#   - persistence : how many distinct days it recurs (chronic vs one-off)
#   - recency     : activity in the most recent window (still live?)
# All three are min-max normalised across zones before blending.
PRIORITY_BLEND = {"impact": 0.55, "persistence": 0.30, "recency": 0.15}
RECENCY_WINDOW_DAYS = 30

# Priority tiers (on the 0-100 score) for the enforcement worklist.
PRIORITY_TIERS = [
    ("Critical", 75),
    ("High", 50),
    ("Medium", 25),
    ("Low", 0),
]


def priority_tier(score: float) -> str:
    for label, threshold in PRIORITY_TIERS:
        if score >= threshold:
            return label
    return "Low"


# ---------------------------------------------------------------------------
# 7. Patrol Forecast — proactive risk layer
# ---------------------------------------------------------------------------
# Every parameter below was fixed by a hold-out backtest (train on early weeks,
# predict the final 14 days). The shipped `backtest()` reproduces STATION skill
# (Spearman rho ~0.87 / top-20 capture ~75%) and the raw-CELL floor (~0.42). The
# clustered ~400m ZONE figure (~0.68 / top-50 ~56%) is a separate one-off experiment,
# not produced by backtest() — see README section 4.4. See forecast.py:backtest().
#
# WHAT IS forecastable (strong, used): WHERE risk concentrates (zone/station/junction)
#   and whether a place is heating up.
# WHAT IS NOT (weak, deliberately NOT claimed): the exact day-of-week or clock hour
#   a violation will occur. created_datetime is an enforcement *logging* time
#   (officers mostly log 02:00-11:00), so the hour axis is a logging artifact, not
#   true congestion timing. The forecast therefore outputs a recommended ENFORCEMENT
#   SHIFT WINDOW with that caveat, never a precise "Tuesday 9am" prediction.

# Exponential recency weighting: a violation's weight halves every HALF-LIFE days.
# 30d won the backtest (stable across 21-45d) — recent activity dominates, but a
# long-dormant chronic spot still contributes.
FORECAST_HALFLIFE_DAYS = 30.0

# Trend = recent rate vs the preceding window. Backtest showed a flagged RISING
# trend persists into the future (~1.56x), so it is trusted and surfaced loudly;
# a FALLING trend is ambiguous (~1.0x), so "cooling" is shown softly and never
# used to recommend *stopping* enforcement.
FORECAST_TREND_RECENT_DAYS = 21
FORECAST_TREND_PRIOR_DAYS = 21
FORECAST_TREND_RISING = 1.30      # recent/prior >= this -> "Rising"
FORECAST_TREND_FALLING = 0.70     # recent/prior <= this -> "Cooling" (shown softly)
FORECAST_TREND_BONUS = 0.15       # max +15% nudge to risk for a strongly rising zone
# A trend is only declared when BOTH windows carry enough volume to be meaningful;
# below this, low-traffic noise would masquerade as a dramatic "Rising" swing.
FORECAST_TREND_MIN_RECENT = 8     # min violations in the recent window to call a trend
FORECAST_TREND_MIN_PRIOR = 4      # min in the prior window to compute a stable ratio

# Recommended weekly patrol cadence by risk tier (visits/week) — an operational
# translation of risk into a roster, NOT a per-day prediction.
FORECAST_CADENCE = {"Critical": 7, "High": 5, "Medium": 3, "Low": 1}

# Risk tiers on the 0-100 forecast risk score (mirrors enforcement tiers).
FORECAST_RISK_TIERS = [("Critical", 75), ("High", 50), ("Medium", 25), ("Low", 0)]


def forecast_risk_tier(score: float) -> str:
    for label, threshold in FORECAST_RISK_TIERS:
        if score >= threshold:
            return label
    return "Low"
