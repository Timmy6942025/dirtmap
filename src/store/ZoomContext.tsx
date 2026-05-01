import { createContext, useContext, useRef } from 'react';

// Zoom control interface exposed by NetworkGraph
export interface ZoomHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface ZoomContextValue {
  zoomRef: React.RefObject<ZoomHandle | null>;
}

const ZoomContext = createContext<ZoomContextValue>({ zoomRef: { current: null } });

export function useZoomContext() {
  return useContext(ZoomContext);
}

// Provider component — wraps children and exposes zoom controls from NetworkGraph
// NetworkGraph registers its zoom handle via the ref stored in context.
// ZoomControls reads the handle from context.
export default function ZoomProvider({ children }: { children: React.ReactNode }) {
  // This ref is written to by NetworkGraph (via useZoomContext → zoomRef.current = {...})
  const zoomRef = useRef<ZoomHandle | null>(null);

  return (
    <ZoomContext.Provider value={{ zoomRef }}>
      {children}
    </ZoomContext.Provider>
  );
}
