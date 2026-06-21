export const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return Math.round(n).toLocaleString();
};

export const fmtFull = (n: number): string => Math.round(n).toLocaleString();
export const pct = (x: number): string => Math.round(x * 100) + "%";

// pretty street/area name from the verbose sample_location string
export const shortLoc = (loc: string | undefined, fallback = ""): string => {
  if (!loc) return fallback;
  const seg = loc.split(",").map((s) => s.trim()).filter(Boolean);
  return seg.slice(0, 2).join(", ") || fallback;
};

export const hourLabel = (h: number): string => `${String(h).padStart(2, "0")}:00`;
