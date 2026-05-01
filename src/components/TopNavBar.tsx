import { useState } from 'react';
import { useNetwork } from '../store/NetworkContext';

export default function TopNavBar() {
  const { state, dispatch } = useNetwork();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <nav className="top-nav-bar">
      <div className="nav-left">
        <div className="logo">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="4" cy="4" r="2.5" fill="#22d3ee" />
            <circle cx="16" cy="4" r="2.5" fill="#f87171" />
            <circle cx="10" cy="16" r="2.5" fill="#fb923c" />
            <line x1="4" y1="4" x2="16" y2="4" stroke="#22d3ee" strokeWidth="1" opacity="0.4" />
            <line x1="4" y1="4" x2="10" y2="16" stroke="#f87171" strokeWidth="1" opacity="0.4" />
            <line x1="16" y1="4" x2="10" y2="16" stroke="#fb923c" strokeWidth="1" opacity="0.4" />
          </svg>
          <span className="logo-text">Dirt<span>Map</span></span>
        </div>
      </div>

      <div className="nav-center">
        <div className="view-toggle">
          <button
            className={`toggle-btn ${state.viewMode === 'public' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'public' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Public View
          </button>
          <button
            className={`toggle-btn ${state.viewMode === 'private' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'private' })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            Private View
          </button>
        </div>
      </div>

      <div className="nav-right">
        <button
          className={`nav-icon-btn ${settingsOpen ? 'active' : ''}`}
          onClick={() => { setSettingsOpen(!settingsOpen); setHelpOpen(false); }}
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className={`nav-icon-btn ${helpOpen ? 'active' : ''}`}
          onClick={() => { setHelpOpen(!helpOpen); setSettingsOpen(false); }}
          title="Help"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>

      {/* Settings Dropdown */}
      {settingsOpen && (
        <div className="nav-dropdown settings-dropdown">
          <div className="dropdown-header">Settings</div>
          <div className="dropdown-item" onClick={() => { dispatch({ type: 'SET_VIEW_MODE', mode: state.viewMode === 'public' ? 'private' : 'public' }); setSettingsOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {state.viewMode === 'public' ? (
                <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><line x1="1" y1="1" x2="23" y2="23" /></>
              ) : (
                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
              )}
            </svg>
            Switch to {state.viewMode === 'public' ? 'Private' : 'Public'} View
          </div>
          <div className="dropdown-item" onClick={() => { dispatch({ type: 'TOGGLE_SIDEBAR' }); setSettingsOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            {state.sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          </div>
          <div className="dropdown-item" onClick={() => { dispatch({ type: 'TOGGLE_LEGEND' }); setSettingsOpen(false); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {state.legendCollapsed ? 'Show Legend' : 'Hide Legend'}
          </div>
        </div>
      )}

      {/* Help Dropdown */}
      {helpOpen && (
        <div className="nav-dropdown help-dropdown">
          <div className="dropdown-header">How to Use DirtMap</div>
          <div className="help-item">
            <strong>Network Graph</strong>
            <span>Click nodes to view details. Drag to reposition. Scroll to zoom.</span>
          </div>
          <div className="help-item">
            <strong>Edges</strong>
            <span>Arrows show leverage direction. Color indicates severity: yellow = mild, orange = moderate, red = severe.</span>
          </div>
          <div className="help-item">
            <strong>Public vs Private</strong>
            <span>Public view hides notes, showing only categories. Private view reveals all details.</span>
          </div>
          <div className="help-item">
            <strong>AI Assistant</strong>
            <span>Click the ⭐ button (bottom-right) to add connections using natural language. E.g., "Alex has embarrassing photos on Morgan"</span>
          </div>
          <div className="help-item">
            <strong>Depth Control</strong>
            <span>Adjust depth to control how many hops of connections are highlighted from a selected node.</span>
          </div>
        </div>
      )}

      {/* Click-outside backdrop */}
      {(settingsOpen || helpOpen) && (
        <div className="dropdown-backdrop" onClick={() => { setSettingsOpen(false); setHelpOpen(false); }} />
      )}
    </nav>
  );
}
