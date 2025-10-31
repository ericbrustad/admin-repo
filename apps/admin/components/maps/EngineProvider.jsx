import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getStoredEngine, setStoredEngine } from '../../lib/mapEngine';

const EngineContext = createContext({ engine: 'leaflet', setEngine: () => {} });

export function MapEngineProvider({ children }) {
  const [engine, setEngineState] = useState(getStoredEngine());

  useEffect(() => {
    const handle = (event) => {
      const next = event?.detail || getStoredEngine();
      setEngineState(next);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('AdminMapEngineChanged', handle);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('AdminMapEngineChanged', handle);
      }
    };
  }, []);

  const updateEngine = useCallback((value) => {
    setEngineState(value);
    setStoredEngine(value);
  }, []);

  return (
    <EngineContext.Provider value={{ engine, setEngine: updateEngine }}>
      {children}
    </EngineContext.Provider>
  );
}

export function useMapEngine() {
  return useContext(EngineContext);
}
