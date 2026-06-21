import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.heat";
import type { Cell, Hotspot, ForecastZone } from "../lib/types";
import { TIER_COLOR } from "../lib/types";

// which zone-marker set to draw, if any
type ZoneMode = "none" | "enforcement" | "forecast";

interface Props {
  cells: Cell[];
  hotspots: Hotspot[];
  forecast: ForecastZone[];
  showHeat: boolean;
  zoneMode: ZoneMode;
  pin: { lat: number; lon: number } | null;
  radiusM: number;
  onPick: (lat: number, lon: number) => void;
  onZoneClick?: (clusterId: number) => void;
  flyTo?: { lat: number; lon: number; zoom?: number } | null;
  /** a point to mark with a pulsing pointer (e.g. the selected forecast zone) */
  highlight?: { lat: number; lon: number; color?: string } | null;
}

const BLR: [number, number] = [12.97, 77.59];

export default function GridMap({
  cells,
  hotspots,
  forecast,
  showHeat,
  zoneMode,
  pin,
  radiusM,
  onPick,
  onZoneClick,
  flyTo,
  highlight,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const zonesRef = useRef<L.LayerGroup | null>(null);
  const pinRef = useRef<L.LayerGroup | null>(null);
  const hiRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  const onZoneRef = useRef(onZoneClick);
  onPickRef.current = onPick;
  onZoneRef.current = onZoneClick;

  // init once
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView(BLR, 12);
    // place zoom control bottom-right so it never overlaps the top-left layer panel
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap · © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => onPickRef.current(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // heat layer (CIS-weighted, log-scaled)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    if (!showHeat) return;
    const pts = cells.map((c) => [c.lat, c.lon, Math.log1p(c.cis)] as [number, number, number]);
    const max = pts.reduce((m, p) => Math.max(m, p[2]), 1);
    // @ts-expect-error leaflet.heat augments L at runtime
    const heat = L.heatLayer(pts, {
      radius: 18,
      blur: 22,
      maxZoom: 16,
      max,
      gradient: { 0.0: "#1d3a8f", 0.35: "#4cc9f0", 0.6: "#ffd166", 0.8: "#ff9f1c", 1.0: "#ff4d5e" },
    });
    heat.addTo(map);
    heatRef.current = heat;
  }, [cells, showHeat]);

  // zone markers (enforcement priority OR forecast risk)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (zonesRef.current) {
      map.removeLayer(zonesRef.current);
      zonesRef.current = null;
    }
    if (zoneMode === "none") return;
    const grp = L.layerGroup();
    if (zoneMode === "enforcement") {
      for (const h of hotspots) {
        const c = TIER_COLOR[h.priority_tier];
        const r = Math.min(7 + Math.sqrt(h.violations) / 7, 24);
        L.circleMarker([h.lat, h.lon], {
          radius: r,
          color: c,
          weight: 2,
          fillColor: c,
          fillOpacity: 0.42,
        })
          .bindPopup(
            `<b>#${h.rank} · ${h.top_station}</b><br>Priority <b>${h.priority_score}</b>/100 · ${h.priority_tier}<br>${h.violations.toLocaleString()} violations · ${Math.round(h.junction_share * 100)}% junction`,
          )
          .on("click", () => onZoneRef.current?.(h.cluster_id))
          .addTo(grp);
      }
    } else {
      for (const z of forecast) {
        const c = TIER_COLOR[z.risk_tier];
        const r = 7 + (z.risk_score / 100) * 17;
        L.circleMarker([z.lat, z.lon], {
          radius: r,
          color: c,
          weight: 2,
          fillColor: c,
          fillOpacity: 0.42,
          dashArray: z.trend === "Rising" ? undefined : "3 3",
        })
          .bindPopup(
            `<b>${z.top_station}</b><br>Risk <b>${z.risk_score}</b>/100 · ${z.risk_tier}<br>Trend ${z.trend} · ${z.cadence_per_week}×/week`,
          )
          .on("click", () => onZoneRef.current?.(z.cluster_id))
          .addTo(grp);
      }
    }
    grp.addTo(map);
    zonesRef.current = grp;
  }, [hotspots, forecast, zoneMode]);

  // pin + radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pinRef.current) {
      map.removeLayer(pinRef.current);
      pinRef.current = null;
    }
    if (!pin) return;
    const grp = L.layerGroup();
    L.circle([pin.lat, pin.lon], {
      radius: radiusM,
      color: "#4cc9f0",
      weight: 1.5,
      fillColor: "#4cc9f0",
      fillOpacity: 0.08,
      dashArray: "5 5",
    }).addTo(grp);
    L.circleMarker([pin.lat, pin.lon], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#4cc9f0",
      fillOpacity: 1,
    }).addTo(grp);
    grp.addTo(map);
    pinRef.current = grp;
  }, [pin, radiusM]);

  // highlight pointer — a pulsing teardrop marker for the selected zone
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hiRef.current) {
      map.removeLayer(hiRef.current);
      hiRef.current = null;
    }
    if (!highlight) return;
    const color = highlight.color || "#4cc9f0";
    const icon = L.divIcon({
      className: "",
      html: `<div class="grid-pointer" style="--pc:${color}">
        <span class="grid-pointer-ring"></span>
        <span class="grid-pointer-pin"></span>
      </div>`,
      iconSize: [30, 42],
      iconAnchor: [15, 40], // tip of the teardrop
    });
    hiRef.current = L.marker([highlight.lat, highlight.lon], { icon, zIndexOffset: 1000 }).addTo(map);
  }, [highlight]);

  // imperative fly-to
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo([flyTo.lat, flyTo.lon], flyTo.zoom ?? 15, { duration: 0.7 });
    }
  }, [flyTo]);

  return <div ref={elRef} className="h-full w-full" />;
}
