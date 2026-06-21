/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070b14",
        bg2: "#0a1020",
        panel: "#111a2e",
        panel2: "#18233c",
        panel3: "#1f2d4a",
        border: "#24324d",
        borderSoft: "#1a2640",
        ink: "#eaf1fb",
        muted: "#93a5c4",
        muted2: "#6477a0",
        accent: "#4cc9f0",
        accent2: "#7b5cff",
        crit: "#ff4d5e",
        high: "#ff9f1c",
        med: "#ffd166",
        low: "#4cc9a0",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(76,201,240,0.25), 0 10px 40px rgba(0,0,0,0.5)",
        card: "0 8px 30px rgba(0,0,0,0.35)",
        "glow-accent": "0 0 30px rgba(76,201,240,0.25)",
        "glow-violet": "0 0 30px rgba(123,92,255,0.25)",
      },
      backgroundImage: {
        "grid-accent": "linear-gradient(90deg, #4cc9f0, #7b5cff)",
        "radial-fade": "radial-gradient(circle at 50% 0%, rgba(76,201,240,0.12), transparent 60%)",
      },
      keyframes: {
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        gridMove: { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "40px 40px" } },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        pulseDot: "pulseDot 2s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        gridMove: "gridMove 8s linear infinite",
      },
    },
  },
  plugins: [],
};
