import { useState } from 'react';
import { useNetwork } from '../store/NetworkContext';
import type { FilterType, Person } from '../types';
import { v4 as uuidv4 } from 'uuid';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'most-connected', label: 'Most Connected' },
  { key: 'most-vulnerable', label: 'Most Vulnerable' },
  { key: 'most-dangerous', label: 'Most Dangerous' },
];

const AVATAR_COLORS = ['#22d3ee', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#a855f7'];

export default function LeftSidebar() {
  const { state, dispatch, getFilteredPeople, getConnectionCount, getVulnerabilityScore, getDangerScore } = useNetwork();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');

  const filteredPeople = getFilteredPeople();

  const handleAddPerson = () => {
    if (!newName.trim()) return;
    const name = newName.trim();
    const parts = name.split(' ');
    const initials = parts
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const person: Person = {
      id: `p${uuidv4().slice(0, 6)}`,
      name,
      initials,
      avatarColor: color,
      hasOnOthers: [],
      othersHaveOnThem: [],
    };
    dispatch({ type: 'ADD_PERSON', person });
    setNewName('');
    setShowAddForm(false);
  };

  const getScoreIndicator = (personId: string, filter: FilterType) => {
    if (filter === 'all') return null;
    let score = 0;
    let maxScore = 25;
    let color = '#22d3ee';
    if (filter === 'most-connected') {
      score = getConnectionCount(personId);
      maxScore = 8;
      color = '#22d3ee';
    } else if (filter === 'most-vulnerable') {
      score = getVulnerabilityScore(personId);
      maxScore = 15;
      color = '#f87171';
    } else if (filter === 'most-dangerous') {
      score = getDangerScore(personId);
      maxScore = 15;
      color = '#fb923c';
    }
    const pct = Math.min((score / maxScore) * 100, 100);
    return (
      <div className="score-bar">
        <div className="score-bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    );
  };

  return (
    <aside className={`left-sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}`}>
      <button
        className="sidebar-toggle-btn"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title={state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ transform: state.sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {!state.sidebarCollapsed && (
        <>
          <div className="sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search people..."
              value={state.searchQuery}
              onChange={(e) => dispatch({ type: 'SET_SEARCH_QUERY', query: e.target.value })}
            />
          </div>

          <div className="sidebar-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`filter-btn ${state.activeFilter === f.key ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_FILTER', filter: f.key })}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="sidebar-people-list">
            {filteredPeople.map((person) => (
              <div
                key={person.id}
                className={`person-item ${state.selectedPersonId === person.id ? 'selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_PERSON', personId: person.id })}
              >
                <div
                  className="person-avatar-small"
                  style={{ backgroundColor: person.avatarColor + '22', color: person.avatarColor, borderColor: person.avatarColor }}
                >
                  {person.initials}
                </div>
                <div className="person-item-info">
                  <span className="person-item-name">{person.name}</span>
                  <span className="person-item-count">
                    {getConnectionCount(person.id)} connections
                  </span>
                </div>
                {getScoreIndicator(person.id, state.activeFilter)}
              </div>
            ))}
          </div>

          <div className="sidebar-add">
            {showAddForm ? (
              <div className="add-form">
                <input
                  type="text"
                  placeholder="Full name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPerson()}
                  autoFocus
                />
                <div className="add-form-actions">
                  <button className="add-confirm-btn" onClick={handleAddPerson}>
                    Add
                  </button>
                  <button className="add-cancel-btn" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="add-person-btn" onClick={() => setShowAddForm(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Person
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
