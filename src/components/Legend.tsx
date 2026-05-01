import { useNetwork } from '../store/NetworkContext';
import type { LeverageCategory } from '../types';

const CATEGORY_COLORS: Record<LeverageCategory, string> = {
  Crush: '#ec4899',
  'Past Experience': '#f97316',
  Photo: '#ef4444',
  Quote: '#8b5cf6',
  Secret: '#6366f1',
  Financial: '#10b981',
  Relationship: '#f59e0b',
  Career: '#06b6d4',
  Reputation: '#a855f7',
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
            <div className="legend-line" style={{ backgroundColor: '#eab308', height: '2px' }} />
            <span>Mild (1-2)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#f97316', height: '3px' }} />
            <span>Moderate (3)</span>
          </div>
          <div className="legend-item">
            <div className="legend-line" style={{ backgroundColor: '#ef4444', height: '4px' }} />
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
