import { useState } from 'react';
import { useNetwork } from '../store/NetworkContext';
import type { LeverageCategory, LeverageEntry, ViewMode } from '../types';
import { parseCategories, parseSeverity } from '../utils/parseCategories';

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

type Tab = 'has-on-others' | 'others-have-on-them';

function SeverityDots({ severity }: { severity: number }) {
  return (
    <div className="severity-dots">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`severity-dot ${i <= severity ? 'filled' : ''}`}
          style={{
            backgroundColor: i <= severity ? (severity >= 4 ? '#f87171' : severity >= 3 ? '#fb923c' : '#fbbf24') : '#18181b',
          }}
        />
      ))}
    </div>
  );
}

function LeverageEntryCard({ entry, viewMode, getPersonById }: { entry: LeverageEntry; viewMode: ViewMode; getPersonById: (id: string) => { name: string; avatarColor: string; initials: string } | undefined }) {
  const target = getPersonById(entry.targetId);
  if (!target) return null;

  return (
    <div className="leverage-entry">
      <div className="leverage-entry-header">
        <div className="leverage-entry-person">
          <div
            className="leverage-avatar-tiny"
            style={{ backgroundColor: target.avatarColor + '22', color: target.avatarColor, borderColor: target.avatarColor }}
          >
            {target.initials}
          </div>
          <span className="leverage-entry-name">{target.name}</span>
        </div>
        <SeverityDots severity={entry.severity} />
      </div>
      <div className="leverage-categories">
        {entry.categories.map((cat) => (
          <span
            key={cat}
            className="category-pill"
            style={{ backgroundColor: CATEGORY_COLORS[cat] + '22', color: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] + '44' }}
          >
            {cat}
          </span>
        ))}
      </div>
      {viewMode === 'private' && (
        <div className="leverage-notes">
          <p>{entry.notes}</p>
          <span className="leverage-date">{entry.createdAt}</span>
        </div>
      )}
      {viewMode === 'public' && (
        <div className="leverage-notes-hidden">
          <span className="hidden-indicator">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            Hidden in public view
          </span>
        </div>
      )}
    </div>
  );
}

export default function RightPanel() {
  const { state, dispatch, getPersonById, getConnectionCount, getVulnerabilityScore, getDangerScore } = useNetwork();
  const [activeTab, setActiveTab] = useState<Tab>('has-on-others');
  const [aiInput, setAiInput] = useState('')

  const handleAiSubmit = () => {
    if (!aiInput.trim() || !state.selectedPersonId) return;
    // Simple local parsing for the panel AI input — auto-fills source as selected person
    const input = aiInput.trim();
    const lower = input.toLowerCase();

    // Try to find a target person mentioned
    let targetId = '';
    for (const p of state.people) {
      if (p.id === state.selectedPersonId) continue;
      const nameLower = p.name.toLowerCase();
      const first = p.name.split(' ')[0].toLowerCase();
      if (lower.includes(nameLower) || lower.includes(first)) {
        targetId = p.id;
        break;
      }
    }

    if (targetId) {
      const categories = parseCategories(input);
      const severity = parseSeverity(input);

      dispatch({
        type: 'ADD_CONNECTION',
        sourceId: state.selectedPersonId,
        targetId,
        categories,
        severity,
        notes: input,
      });
    }
    setAiInput('');
  };

  if (!state.selectedPersonId || !state.rightPanelOpen) return null;

  const person = getPersonById(state.selectedPersonId);
  if (!person) return null;

  const connectionCount = getConnectionCount(person.id);
  const vulnerability = getVulnerabilityScore(person.id);
  const danger = getDangerScore(person.id);

  return (
    <aside className="right-panel">
      <div className="right-panel-header">
        <div className="profile-card">
          <div
            className="profile-avatar"
            style={{ backgroundColor: person.avatarColor + '22', color: person.avatarColor, borderColor: person.avatarColor }}
          >
            {person.initials}
          </div>
          <div className="profile-info">
            <h2 className="profile-name">{person.name}</h2>
            <div className="profile-stats">
              <div className="stat">
                <span className="stat-value">{connectionCount}</span>
                <span className="stat-label">Links</span>
              </div>
              <div className="stat">
                <span className="stat-value danger">{danger}</span>
                <span className="stat-label">Danger</span>
              </div>
              <div className="stat">
                <span className="stat-value vulnerability">{vulnerability}</span>
                <span className="stat-label">Exposure</span>
              </div>
            </div>
          </div>
        </div>
        <button
          className="close-panel-btn"
          onClick={() => {
            dispatch({ type: 'SET_RIGHT_PANEL', open: false });
            dispatch({ type: 'SELECT_PERSON', personId: null });
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === 'has-on-others' ? 'active' : ''}`}
          onClick={() => setActiveTab('has-on-others')}
        >
          Has On Others
          <span className="tab-count">{person.hasOnOthers.length}</span>
        </button>
        <button
          className={`panel-tab ${activeTab === 'others-have-on-them' ? 'active' : ''}`}
          onClick={() => setActiveTab('others-have-on-them')}
        >
          Others Have On Them
          <span className="tab-count">{person.othersHaveOnThem.length}</span>
        </button>
      </div>

      <div className="panel-entries">
        {activeTab === 'has-on-others' && (
          <>
            {person.hasOnOthers.length === 0 ? (
              <div className="empty-state">No leverage entries</div>
            ) : (
              person.hasOnOthers.map((entry) => (
                <LeverageEntryCard key={entry.id} entry={entry} viewMode={state.viewMode} getPersonById={getPersonById} />
              ))
            )}
          </>
        )}
        {activeTab === 'others-have-on-them' && (
          <>
            {person.othersHaveOnThem.length === 0 ? (
              <div className="empty-state">No leverage entries</div>
            ) : (
              person.othersHaveOnThem.map((entry) => (
                <LeverageEntryCard key={entry.id} entry={entry} viewMode={state.viewMode} getPersonById={getPersonById} />
              ))
            )}
          </>
        )}
      </div>

      <div className="panel-ai-input">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"          stroke="#22d3ee" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <input
          type="text"
          placeholder="Describe in natural language..."
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
        />
      </div>
    </aside>
  );
}
