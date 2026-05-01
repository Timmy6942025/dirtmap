import { useNetwork } from '../store/NetworkContext';
import type { LeverageCategory } from '../types';

const CATEGORY_COLORS: Record<LeverageCategory, string> = {
  Crush: '#db2777',
  'Past Experience': '#ea580c',
  Photo: '#e11d48',
  Quote: '#7c3aed',
  Secret: '#3b82f6',
  Financial: '#059669',
  Relationship: '#d97706',
  Career: '#0891b2',
  Reputation: '#9333ea',
};

export default function Legend() {
  const { state, dispatch } = useNetwork();

  return (
    <div className={`legend ${state.legendCollapsed ? 'collapsed' : ''}`}>
      <button
        className="legend-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        {state.legendCollapsed ? 'Legend' : ''}
      </button>

      {!state.legendCollapsed && (
        <div className="legend-content">
          <h4>Edge Severity</h4>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#fbbf24', height: '2px' }} />
            <span>Mild (1-2)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#fb923c', height: '3px' }} />
            <span>Moderate (3)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#f87171', height: '4px' }} />
            <span>Severe (4-5)</span>
          </div>

          <h4 className="legend-section-title">Categories</h4>
          <div className="legend-categories">
            {(Object.entries(CATEGORY_COLORS) as [LeverageCategory, string][]).map(([cat, color]) => (
              <span
                key={cat}
                className="legend-category-pill"
                style={{ backgroundColor: color + '22', color, borderColor: color + '44' }}
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
