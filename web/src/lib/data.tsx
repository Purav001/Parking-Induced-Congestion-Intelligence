import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { GridData } from "./types";

interface DataState {
  data: GridData | null;
  error: string | null;
}

const DataCtx = createContext<DataState>({ data: null, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ data: null, error: null });

  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}data/grid.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: GridData) => alive && setState({ data: d, error: null }))
      .catch((e) => alive && setState({ data: null, error: String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  return <DataCtx.Provider value={state}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
