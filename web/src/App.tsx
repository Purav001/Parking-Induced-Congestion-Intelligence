import { lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import { Loader } from "./components/ui";

// route-split the heavy pages (Leaflet / Recharts) so Landing stays light
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Forecast = lazy(() => import("./pages/Forecast"));
const Insights = lazy(() => import("./pages/Insights"));

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const loc = useLocation();
  const isLanding = loc.pathname === "/";
  return (
    <div className="relative min-h-screen">
      {/* ambient backdrop for the app pages (landing has its own richer one) */}
      {!isLanding && (
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-dots opacity-30" />
          <div
            className="absolute left-1/2 top-0 h-[40vh] w-[80vw] -translate-x-1/2 blur-[120px]"
            style={{ background: "radial-gradient(ellipse at center,#4cc9f015,transparent 70%)" }}
          />
        </div>
      )}
      <Nav />
      <Suspense fallback={<Loader />}>
        <AnimatePresence mode="wait">
          <Routes location={loc} key={loc.pathname}>
            <Route path="/" element={<Page><Landing /></Page>} />
            <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
            <Route path="/forecast" element={<Page><Forecast /></Page>} />
            <Route path="/insights" element={<Page><Insights /></Page>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </div>
  );
}
