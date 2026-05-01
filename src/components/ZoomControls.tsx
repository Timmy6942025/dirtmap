import { useNetwork } from '../store/NetworkContext';
import { useZoomContext } from '../store/ZoomContext';

export default function ZoomControls() {
  const { state, dispatch } = useNetwork();
  const { zoomRef } = useZoomContext();

  return (
    <div className="zoom-controls">
      <button
        className="zoom-btn"
        onClick={() => zoomRef.current?.zoomOut()}
        title="Zoom out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>

      <button
        className="zoom-btn"
        onClick={() => zoomRef.current?.zoomIn()}
        title="Zoom in"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>

      <button
        className="zoom-btn"
        onClick={() => zoomRef.current?.resetZoom()}
        title="Reset zoom"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>

      <div className="zoom-divider" />

      <div className="depth-indicator">
        <span className="depth-label">Depth</span>
        <span className="depth-value">{state.networkDepth}</span>
      </div>

      <button
        className="zoom-btn"
        onClick={() => dispatch({ type: 'SET_NETWORK_DEPTH', depth: Math.max(1, state.networkDepth - 1) })}
        title="Decrease depth"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <button
        className="zoom-btn"
        onClick={() => dispatch({ type: 'SET_NETWORK_DEPTH', depth: Math.min(3, state.networkDepth + 1) })}
        title="Increase depth"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div className="zoom-divider" />

      <button
        className="zoom-btn expand-btn"
        onClick={() => dispatch({ type: 'SET_NETWORK_DEPTH', depth: 2 })}
        title="Show 2nd degree connections"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
          <circle cx="12" cy="12" r="10" strokeDasharray="2 2" />
        </svg>
        Expand
      </button>
    </div>
  );
}
