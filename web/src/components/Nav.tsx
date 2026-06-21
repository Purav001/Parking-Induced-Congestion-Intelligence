import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/forecast", label: "Forecast" },
  { to: "/insights", label: "Insights" },
];

export default function Nav() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[1200] border-b border-borderSoft bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-grid-accent text-bg font-black">
            G
          </div>
          <div className="leading-none">
            <div className="text-lg font-extrabold tracking-wide gradient-text">GRID</div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted2">
              Congestion Intelligence
            </div>
          </div>
        </NavLink>

        {/* desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `relative px-3.5 py-2 text-sm font-semibold transition-colors ${
                  isActive ? "text-ink" : "text-muted hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-2 -bottom-[1px] h-0.5 rounded-full bg-grid-accent"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/dashboard"
            className="ml-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-bold text-bg transition-transform hover:scale-[1.03]"
          >
            Open App →
          </NavLink>
        </nav>

        {/* mobile hamburger */}
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-border md:hidden"
        >
          <motion.span animate={{ rotate: open ? 45 : 0, y: open ? 6 : 0 }} className="h-0.5 w-5 bg-ink" />
          <motion.span animate={{ opacity: open ? 0 : 1 }} className="h-0.5 w-5 bg-ink" />
          <motion.span animate={{ rotate: open ? -45 : 0, y: open ? -6 : 0 }} className="h-0.5 w-5 bg-ink" />
        </button>
      </div>

      {/* mobile menu sheet */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-borderSoft md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm font-semibold ${
                      isActive ? "bg-panel2 text-ink" : "text-muted"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <NavLink
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="mt-1 rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-bold text-bg"
              >
                Open App →
              </NavLink>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* route progress sliver */}
      <motion.div
        key={loc.pathname}
        className="h-[2px] bg-grid-accent"
        initial={{ scaleX: 0, transformOrigin: "0%" }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.4 }}
      />
    </header>
  );
}
