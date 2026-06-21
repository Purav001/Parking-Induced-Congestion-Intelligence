# GRID — Project Context & Complete Reference

> **One-line pitch:** GRID turns a city's raw police parking-violation log into an
> AI-driven decision tool that (1) finds the parking hotspots that actually choke
> traffic, (2) ranks them for targeted enforcement, and (3) **forecasts where to send
> patrols next week** — moving the city from reactive ticketing to proactive prevention.

This document is the single source of truth for the project: the problem, the solution,
the data, the methodology, the architecture, the tech stack, the honest limitations, and
the numbers. It covers both halves of the system — the **Python pipeline** that does the
analytics and the **React web app** that visualises it.

---

## 0. The 30-Second Story

- **Problem:** Illegal & spillover parking chokes Bengaluru's roads. Enforcement is
  reactive and patrol-based. There's no map of *which* violations actually hurt traffic
  flow, and no way to prioritise where to send limited patrols.
- **Data:** ~298,000 real, anonymized police parking-violation records (Bengaluru,
  Nov 2023 – Apr 2024).
- **Solution:** GRID scores every violation by its **traffic-flow impact**, clusters them
  into **327 patrollable hotspot zones**, ranks them into a **Critical→Low enforcement
  worklist**, and adds a **backtested Patrol Forecast** that predicts next week's risk.
  A web app lets you explore the map, **drop a pin on any area** for an exact report, and
  browse the forecast roster.
- **Headline insight:** **75% of all congestion impact is concentrated in just 10% of the
  active map area** — so targeting beats blanket patrols, and we can prove it.
- **Proof it works:** the forecast is validated on held-out data — **the top-20 forecast
  divisions capture 75% of the next fortnight's violations** (Spearman ρ = 0.87).

---

## 1. The Problem (Problem Statement)

**Operational challenge:** On-street illegal parking and spillover parking near commercial
areas, metro stations, and events choke carriageways and intersections.

**Why it's hard today:**
1. Enforcement is **patrol-based and reactive** — officers only act on what they see.
2. There is **no heatmap** of parking violations vs. their actual congestion impact.
3. It is **difficult to prioritise** which enforcement zones matter most.

**The question we answer:** *How can AI-driven parking intelligence detect illegal-parking
hotspots and quantify their impact on traffic flow to enable targeted enforcement?*

---

## 2. The Solution at a Glance

GRID is a **two-layer intelligence system** on top of the violation feed:

| Layer | Question it answers | Output |
|---|---|---|
| **Layer 1 — Congestion Intelligence** (rear-view) | *Where has illegal parking hurt traffic the most?* | Heatmap + ranked enforcement worklist of 327 hotspot zones |
| **Layer 2 — Patrol Forecast** (windshield) | *Where should patrols go next week?* | Risk-scored, trend-aware patrol roster, validated by backtest |

Both layers are delivered through an **animated React web app** — explore the map, drop a
pin on any neighbourhood for an exact area report, browse the worklist, and read the
forecast roster.

---

## 3. The Dataset

| Property | Value |
|---|---|
| Source | Anonymized police parking-enforcement records, Bengaluru |
| Raw records | **298,450** |
| After cleaning | **248,371** scored (drops 50,074 `rejected`/`duplicate` + 5 bad timestamps) |
| Time span | **2023-11-10 → 2024-04-08** (~5 months / 21 weeks) |
| Geocoding | 100% lat/long populated |
| Police divisions | 54 |
| Signalised junctions | 168 |
| Vehicle classes | 22 (scooter → bus/HGV) |

**Key columns used:** `latitude`, `longitude`, `violation_type` (a stringified JSON list —
a record can carry multiple offences), `vehicle_type`, `created_datetime`, `police_station`,
`junction_name`, `validation_status`.

**What the data shows (post-cleaning, by primary offence):**
- WRONG PARKING (118k), NO PARKING (105k), PARKING IN A MAIN ROAD (19k), plus footpath /
  double / near-crossing parking — i.e. **the carriageway-blocking offences dominate.**
- **50.3%** of violations are tagged on signalised junctions.
- **39%** fall in defined peak hours.

> **Counting note:** quote *per-record by primary offence* (118k / 105k / 19k), which is
> what the engine scores on and what the app shows. The raw file allows multiple offences
> per record, so a per-label tally is higher (e.g. WRONG PARKING ~165k records).

---

## 4. The Core Idea — Congestion Impact Score (CIS)

The central insight: **a raw ticket count is misleading.** A scooter parked off-peak on a
side street is not the same as a bus double-parked on an arterial at a junction during rush
hour. GRID scores every violation by **how much it actually obstructs moving traffic.**

### 4.1 Per-violation formula
```
record_impact = severity × vehicle_PCU × time_of_day × junction_proximity
```

| Factor | Meaning | Example values |
|---|---|---|
| **severity** | How much the offence blocks the carriageway | double-parking 1.8 · main-road 1.7 · near-crossing 1.6 · footpath 1.4 · wrong-parking 1.2 · no-parking 1.0 · plate/film/fare ≈0.15 |
| **vehicle_PCU** | Road space occupied (IRC Passenger-Car-Unit basis) | two-wheeler 0.5 · car 1.0 · LCV 1.5 · bus 3.0 · HGV 3.5 |
| **time_of_day** | Congestion sensitivity of the hour | peak 1.5 · shoulder 1.2 · off-peak 0.8 |
| **junction_proximity** | On a signalised junction? (intersection capacity loss spreads upstream) | junction 1.4 · mid-block 1.0 |

All weights live in one file (`src/weights.py`) so a traffic engineer can audit and tune
them without touching any logic.

### 4.2 From points → zones (3-step clustering)
1. **Grid:** snap every record into ~110 m cells; cell CIS = Σ record_impact.
2. **Hot cells:** keep the top 10% of cells by CIS.
3. **Leader/canopy clustering:** seed a zone at the highest-CIS unassigned hot cell, absorb
   every unassigned hot cell within 200 m, repeat. → **327 compact, dispatchable zones**
   (each a tight disk, not one chained city-wide blob).

### 4.3 Enforcement Priority Score (0–100)
```
priority = 0.55·impact + 0.30·persistence + 0.15·recency
```
- **impact** = normalised log(1+CIS) — log-compressed because CIS is heavy-tailed.
- **persistence** = distinct active days (chronic vs. one-off).
- **recency** = violations in the last 30 days (still live?).

Tiers: **Critical ≥75 · High ≥50 · Medium ≥25 · Low <25.** Each zone gets an
auto-generated **recommended action** (dedicated unit vs. rotating beat, towing for
lane-blockers, bollards for footpath parking, structural fixes for chronic spots).

---

## 5. The Forecast — From Rear-View to Windshield

The worklist says *where it has been bad*. The forecast says *where to go next* — and it is
**deliberately honest about what is and isn't predictable**, which we proved with a backtest.

### 5.1 How it works (deterministic, no training, instant)
```
risk = minmax(log(1 + recency_weighted_rate)) × (1 + up-to-0.15 if strongly Rising)
```
- **Recency weight** halves every **30 days** → a heating-up spot outranks a cooled-off one.
- **Trend** = recent 21-day count vs. prior 21 days (Rising / Steady / Cooling), only
  declared when volume is high enough to be meaningful.
- Score → tier → **recommended weekly patrol cadence** (Critical 7× · High 5× · Medium 3× ·
  Low 1×) = an actual **patrol roster**, not a vague alert.

### 5.2 We validated it (backtest on held-out data)
Train on the early weeks, predict the final 14 days, measure skill:

| Unit | Spearman ρ (past→future) | Recall* | Verdict |
|---|---|---|---|
| **Station (division)** | **0.87** | **75%** (top-20) | strongly forecastable ✅ shipped |
| Zone (~400 m) | ~0.68 | ~56% (top-50) | forecastable (the roster unit) |
| Cell (110 m) | 0.42 | 14% (top-20) | too sparse alone — conservative floor ✅ shipped |

\* share of the next fortnight's actual violations falling in the top-K forecast units.
The pipeline re-runs the **station** and **cell-proxy** backtests live each run and ships
them in `forecast.json`; the zone figure is a separate one-off clustering experiment.

### 5.3 The honesty boundary (this is a strength, not a weakness)
- **It forecasts WHERE, not the exact WHEN.** `created_datetime` is an enforcement *logging*
  time (≈41% of records stamped before 07:00 — officers batch-log, they don't ticket more
  cars at 3am). So a "Tuesday 9am" claim would predict *paperwork*, not congestion.
- The UI therefore frames every shift window as a **recorded-ticket slot**, flags
  **overnight** ones ⚠ as do-not-deploy, and softly cautions windows inside the documented
  02:00–13:00 logging band.
- **Per-zone day-of-week had no skill** → the roster recommends a *cadence*, never a weekday.
- **"Rising" is trusted, "Cooling" is shown softly** (backtest: rising trends persist ~1.56×,
  falling ones are ambiguous ~1.0×), so cooling never stops patrols.
- **The single upgrade** that would calibrate timing: fuse a live traffic-speed feed
  (Google/HERE/probe, loop detectors, bus-AVL).

### 5.4 The "Movers" — the proactive payoff
**43 zones** rank materially higher on the forecast than on the historical worklist — i.e.
recent activity the rear-view report underrates. These are the zones a reactive system would
miss. The app surfaces them with a dedicated **Movers** filter and a "Worklist #43 →
Forecast #21" badge.

---

## 6. End-to-End Flow

```
 jan to may police violation.csv  (298,450 rows)
            │
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  src/pipeline.py   (one command, ~6 seconds, pure pandas)    │
 ├─────────────────────────────────────────────────────────────┤
 │ [1] Load & Clean    → drop rejected/duplicate, bad geo/time  │
 │ [2] Score Records   → CIS per violation (weights.py)         │
 │ [3] Build Grid      → ~110 m cells (7,397) + per-cell detail │
 │ [4] Detect Hotspots → leader clustering → 327 zones+priority │
 │ [5] Forecast        → risk, trend, cadence, backtest         │
 │ [6] Summaries       → KPIs, distributions, station rollups   │
 │ [7] Write Outputs   → output/*.json + web/public/data/grid.json │
 └─────────────────────────────────────────────────────────────┘
            │
            ▼
 web/public/data/grid.json   (summary + hotspots + forecast + cells)
            │
            ▼
 web/  React app  (npm run dev → http://localhost:5173)
   ├─ /              Landing  (animated hero + journey)
   ├─ /dashboard     map + Area Explorer (pin-drop) + Worklist
   ├─ /forecast      patrol roster + risk map + zone report
   └─ /insights      animated charts (the "why")
```

**Step-by-step:**
1. **Load & Clean** — parse timestamps to IST, validate geo against a Bengaluru bounding
   box, drop reviewed-rejected/duplicate tickets (so they can't inflate hotspots), keep
   unreviewed ones (absence of review ≠ rejection).
2. **Score Records** — compute CIS per record; severity = the most-severe offence on a
   multi-offence record.
3. **Build Grid** — aggregate to ~110 m cells (heatmap substrate) plus a per-cell
   hour/violation/vehicle breakdown (powers exact pin-drop analytics).
4. **Detect Hotspots** — top-10% cells → leader clustering → 327 zones → Enforcement
   Priority Score & tier.
5. **Forecast** — recency-weighted risk, trend, cadence, plus a live hold-out backtest.
6. **Summaries** — city KPIs, impact-concentration curve, distributions, weights used.
7. **Write Outputs** — JSON files in `output/` and the lean `web/public/data/grid.json`
   bundle the React app reads.

---

## 7. Features (what the user sees)

The web app is a multi-page React site with four routes.

**Landing (`/`)** — an animated hero (aurora + perspective-grid backdrop, word-reveal
headline, count-up KPIs), a scroll-revealed "data → decision" journey timeline, the
problem framing, and the two-layer explainer.

**Dashboard (`/dashboard`)** — a Leaflet map + a tabbed sidebar:
- **Map** — independent **layer checkboxes** (CIS-weighted heatmap / priority-coloured
  hotspot zones — uncheck both for a clean map to pin on), a radius selector, and a legend.
- **Area Explorer** — click anywhere (or pick a worklist zone) to **drop a pin** and get an
  **exact** area report: a **severity tier** banner, violations, congestion impact,
  city-share, hour pattern, violation/vehicle mix, hotspot zones inside, **and a patrol
  forecast for that area**. Exact because the ~110 m cells partition every violation
  (their counts sum to the city total).
- **Worklist** — ranked zones grouped/filtered by tier (Critical → Low); clicking one drops
  the pin, flies the map, and auto-switches to the Area report.

**Forecast (`/forecast`)** — a Leaflet risk map + tabbed sidebar:
- **Green validation banner** (live backtest), **roster summary** (patrol visits/week,
  Movers, rising zones, tier counts), honesty caveat.
- **Roster** tab — risk-ranked zone cards filterable All / Movers / Rising / Critical →
  Low, with trend badge, cadence, and logging-time shift window.
- **Report** tab — clicking a zone plants a **pin pointer**, sets the map title to the area
  name, and opens the full forecast report (risk gauge, cadence, trend, shift, mix,
  junctions).

**Insights (`/insights`)** — animated Recharts: impact-concentration bars (1/5/10%),
hour-of-day histogram (peak hours highlighted), and impact-ranked violation / vehicle /
division charts. All computed live from the data — nothing hardcoded.

**Cross-cutting:** code-split routes, animated page transitions, mobile hamburger nav,
keyboard-focus + reduced-motion a11y, graceful error/loading states, and a shareable
deep-link for a pinned area (`/#/dashboard?pin=<lat>,<lon>,<radius>`).

---

## 8. Tech Stack

| Area | Choice | Why |
|---|---|---|
| **Data engine** | **Python 3** + **pandas** + **NumPy** | Fast, deterministic, industry-standard for tabular analytics; processes 298K rows in ~6 s |
| **Forecast model** | Recency-weighted frequency + trend (hand-built) | No training, instant, fully auditable — every score is explainable |
| **Front-end** | **Vite + React 18 + TypeScript** | Modern, fast HMR, type-safe; static build deploys anywhere |
| **Styling / animation** | **Tailwind CSS** + **Framer Motion** | Consistent dark theme + tasteful, performant animations |
| **Mapping** | **Leaflet.js** + **Leaflet.heat** | Lightweight interactive maps + weighted heatmap |
| **Charts** | **Recharts** | Declarative, animated charts |
| **Basemap** | CartoDB dark tiles | Clean dark cartography (the only online dependency) |
| **Data hand-off** | Generated `web/public/data/grid.json` | Static JSON — the app does no heavy analytics, just renders |

**Design principles:** deterministic (same input → same output), transparent (all knobs in
`weights.py`), honest (limitations surfaced in the UI), fast (~6 s pipeline), and
explainable (no black box).

---

## 9. Architecture & File Map

```
Grid/
├── jan to may police violation_anonymized791b166.csv   # input dataset (298,450 rows)
│
├── src/                         # the engine (Python, ~1,030 lines)
│   ├── weights.py     (211 ln)  # ALL tunable knobs: CIS weights, PCU, clustering, forecast params
│   ├── pipeline.py    (520 ln)  # ETL → score → grid → cluster → forecast → outputs (orchestrator)
│   └── forecast.py    (301 ln)  # patrol-forecast risk model + hold-out backtest
│
├── output/                      # generated JSON artifacts
│   ├── hotspots.json            # ranked enforcement worklist
│   ├── grid_cells.json          # ~110 m cells (heatmap substrate)
│   ├── cell_details.json        # per-cell hour/violation/vehicle breakdowns (pin-drop analytics)
│   ├── forecast.json            # risk, trend, cadence, roster, backtest
│   ├── summary.json             # KPIs, distributions, weights used
│   ├── station_summary.json     # per-division rollups
│   └── records_sample.json      # top high-impact raw points
│
├── web/                         # the front-end (Vite + React + TS, ~2,900 lines)
│   ├── public/data/grid.json    # GENERATED bundle the app reads (written by the pipeline)
│   ├── src/
│   │   ├── lib/                 # types.ts · data.tsx (loader) · aggregate.ts (radius math) · format.ts
│   │   ├── components/          # Nav · GridMap · AreaPanel · ForecastReport · HeroBackdrop · ui.tsx
│   │   └── pages/               # Landing · Dashboard · Forecast · Insights
│   ├── tailwind.config.js       # dark theme tokens
│   ├── vercel.json              # static deploy config
│   └── README.md                # front-end + deploy docs
│
├── docs/                        # screenshots used in README (landing/dashboard/forecast/insights)
├── README.md                    # methodology & run instructions
└── CONTEXT.md                   # this file
```

**Separation of concerns:** `weights.py` = policy (what to value), `pipeline.py` +
`forecast.py` = computation, `output/` + `web/public/data/grid.json` = data contract,
`web/src/` = presentation. The front-end never computes analytics — it only renders and
aggregates what the pipeline produced (the pin-drop sums precomputed cells client-side).

---

## 10. Key Numbers (cheat-sheet)

| Metric | Value |
|---|---|
| Raw records | 298,450 |
| Scored records (after cleaning) | **248,371** |
| Rejected/duplicate filtered out | 50,074 |
| Time span | Nov 2023 – Apr 2024 (~21 weeks) |
| Police divisions / junctions | 54 / 168 |
| Grid cells (~110 m) | 7,397 |
| **Hotspot zones** | **327** |
| Critical / High enforcement zones | 10 / 37 |
| Total modelled congestion impact | 315,211 CIS units |
| **Impact concentration (top 10% of hot cells)** | **75.3%** |
| Violations tagged on junctions | 50.3% |
| Violations in peak hours | 39.2% |
| **Forecast backtest (station)** | **ρ = 0.87, top-20 capture 75%** |
| Forecast risk tiers (Crit/High/Med/Low) | 24 / 103 / 150 / 50 |
| Recommended patrol visits/week | 1,183 |
| Zones trending up (Rising) | 99 |
| "Movers" (forecast > worklist) | 43 |
| Pipeline runtime | ~6 seconds |

**#1 hotspot example:** Kempe Gowda / Majestic area (Upparpet division) — priority 100/100,
~10,200 violations over 151 days, 100% at junctions, peak 8–10am. A real, known Bengaluru
choke point — which validates that the model finds the right places.

The two most defensible claims: the **75% concentration** stat and the **0.87 backtest**.

---

## 11. Honest Limitations (say these out loud — it reads as maturity)

1. **Impact is modelled, not measured.** CIS is a transparent, IRC-aligned *index*, not a
   calibrated vehicle-delay figure. Next step: fit weights against real traffic-speed data.
2. **Timestamps are enforcement-logging times,** not when congestion peaks (≈41% logged
   before 7am). Handled honestly: the forecast claims *where*, not the exact *when*.
3. **Junction flag is metadata, not geometry** — it comes from a free-text tag whose
   coverage varies by division.
4. **Persistence ≈ patrol coverage** — a daily-patrolled spot looks persistent regardless of
   true chronicity (same logging bias).
5. **No dwell-time term** — a 10-hour blockage scores like a 2-minute one (the duration
   columns are empty in this dataset).
6. **Severity & PCU weights are expert estimates** — centralised in `weights.py` for review.

The one upgrade that closes most of these gaps: fuse a live traffic-speed feed.

---

## 12. Production Roadmap

1. **Live ingestion** from the enforcement app → rolling daily re-scoring + forecast refresh.
2. **Traffic-feed fusion** → replace modelled impact with measured delay; calibrate CIS;
   convert forecast timing from logging-time to true congestion-time.
3. **Auto-backtest** each week so the displayed skill is always current; add seasonality.
4. **Feedback loop** → track CIS/risk in enforced zones over time to *measure* whether
   targeting actually reduces congestion.
5. **Event awareness** → overlay metro stations & event calendars to anticipate spillover.

---

## 13. How to Run

```bash
# 1. run the analytics pipeline (~6 s on the 298K-row file)
python3 -m venv .venv
.venv/bin/pip install pandas numpy scikit-learn
.venv/bin/python src/pipeline.py "jan to may police violation_anonymized791b166.csv"
#    → writes output/*.json AND web/public/data/grid.json

# 2. run the web app
cd web
npm install
npm run dev          # → http://localhost:5173
```

Deploy: the web app is a static Vite build — import `web/` into Vercel (or `npx vercel`),
data is committed JSON so no backend is needed. See `web/README.md`.

**Demo script (60 seconds):**
1. **Landing** — the animated hero + the data→decision journey set the story.
2. **Dashboard** — drop a pin on a busy area: "exact report — Critical severity, 26k
   violations, hour pattern, and a patrol forecast for this exact spot."
3. **Insights** — "here's why targeting works: 75% of impact in 10% of the area."
4. **Forecast** — "the windshield: validated forecast, top-20 divisions capture 75% of next
   fortnight's violations. Here's next week's patrol roster."
5. Click **Movers** — "these 43 zones a reactive system would miss — recent activity flags
   them now."

---

*GRID — Parking-Induced Congestion Intelligence. Deterministic, explainable, validated,
and honest about its limits.*
