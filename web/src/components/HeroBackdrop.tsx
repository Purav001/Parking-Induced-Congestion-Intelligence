import { motion } from "framer-motion";

/**
 * Calm, premium hero backdrop — deliberately restrained:
 *   1. a slow aurora gradient wash (indigo → teal)
 *   2. a perspective "floor" grid that recedes to a horizon (evokes a road/map)
 *   3. one soft horizon glow line
 * No busy dot-scatter — the focus stays on the headline.
 */
export default function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* base wash */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0a1226 0%,#070b14 60%)" }} />

      {/* drifting aurora blobs (soft, large, slow) */}
      <motion.div
        className="absolute left-1/2 top-[-10%] h-[60vh] w-[70vw] -translate-x-1/2 rounded-[50%] blur-[90px]"
        style={{ background: "radial-gradient(ellipse at center,#7b5cff40,transparent 65%)" }}
        animate={{ opacity: [0.5, 0.8, 0.5], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[20%] top-[5%] h-[50vh] w-[45vw] rounded-[50%] blur-[100px]"
        style={{ background: "radial-gradient(ellipse at center,#4cc9f038,transparent 65%)" }}
        animate={{ opacity: [0.4, 0.7, 0.4], x: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[12%] top-[12%] h-[40vh] w-[35vw] rounded-[50%] blur-[100px]"
        style={{ background: "radial-gradient(ellipse at center,#4cc9a02e,transparent 65%)" }}
        animate={{ opacity: [0.35, 0.6, 0.35], x: [0, -30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* horizon glow line */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: "64%",
          height: 1,
          background: "linear-gradient(90deg,transparent,#4cc9f0aa 25%,#7b5cffaa 75%,transparent)",
          boxShadow: "0 0 30px 4px #4cc9f055",
        }}
      />

      {/* perspective floor grid (CSS 3D) receding to the horizon */}
      <div className="absolute inset-x-0 bottom-0 h-[40%] overflow-hidden [perspective:340px]">
        <motion.div
          className="absolute inset-0 origin-bottom"
          style={{
            transform: "rotateX(68deg)",
            backgroundImage:
              "linear-gradient(to right,#4cc9f01f 1px,transparent 1px),linear-gradient(to bottom,#4cc9f01f 1px,transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(to top,#000 5%,transparent 85%)",
            WebkitMaskImage: "linear-gradient(to top,#000 5%,transparent 85%)",
          }}
          animate={{ backgroundPositionY: ["0px", "44px"] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* fine top vignette + bottom fade to page bg */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bg to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
