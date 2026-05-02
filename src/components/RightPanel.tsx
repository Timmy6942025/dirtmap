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

function SeverityDots({ severity }: { severity: number }) {
  return (
    <div className={`severity-dots`}>
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

// Find a leverage entry by scanning all people
function findEntry(people: { id: string; name: string; avatarColor: string; initials: string; hasOnOthers: LeverageEntry[] }[], entryId: string) {
  for (const p of people) {
    const entry = p.hasOnOthers.find((e) => e.id === entryId);
    if (entry) return { entry, sourcePerson: p };
  }
  return null;
}

function EdgeDetailCard({ entryId, people, getPersonById, onClose }: { entryId: string; people: { id: string; name: string; avatarColor: string; initials: string; hasOnOthers: LeverageEntry[] }[]; getPersonById: (id: string) => { name: string; avatarColor: string; initials: string } | undefined; onClose: () => void }) {
  const found = findEntry(people, entryId);
  if (!found) return null;

  const { entry, sourcePerson } = found;
  const targetPerson = getPersonById(entry.targetId);

  return (
    <div className={`edge-detail-card`}>
      <div className={`edge-detail-header`}>
        <div className={`edge-detail-title`}>
          <svg width={`14`} height={`14`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <line x1={`5`} y1={`12`} x2={`19`} y2={`12`} />
            <polyline points={`12 5 19 12 12 19`} />
          </svg>
          Connector Detail
        </div>
        <button className={`edge-detail-close`} onClick={onClose} title={`Close`}>
          <svg width={`14`} height={`14`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <line x1={`18`} y1={`6`} x2={`6`} y2={`18`} />
            <line x1={`6`} y1={`6`} x2={`18`} y2={`18`} />
          </svg>
        </button>
      </div>

      <div className={`edge-detail-parties`}>
        <div className={`edge-party`}>
          <div
            className={`leverage-avatar-tiny`}
            style={{ backgroundColor: sourcePerson.avatarColor + '22', color: sourcePerson.avatarColor, borderColor: sourcePerson.avatarColor }}
          >
            {sourcePerson.initials}
          </div>
          <span>{sourcePerson.name}</span>
          <span className={`edge-party-role`}>has dirt on</span>
        </div>
        <div className={`edge-arrow`}>
          <svg width={`16`} height={`16`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <line x1={`5`} y1={`12`} x2={`19`} y2={`12`} />
            <polyline points={`12 5 19 12 12 19`} />
          </svg>
        </div>
        <div className={`edge-party`}>
          {targetPerson && (
            <div
              className={`leverage-avatar-tiny`}
              style={{ backgroundColor: targetPerson.avatarColor + '22', color: targetPerson.avatarColor, borderColor: targetPerson.avatarColor }}
            >
              {targetPerson.initials}
            </div>
          )}
          <span>{targetPerson?.name ?? 'Unknown'}</span>
        </div>
      </div>

      <div className={`edge-detail-body`}>
        <div className={`edge-detail-severity`}>
          <span className={`edge-detail-label`}>Severity</span>
          <SeverityDots severity={entry.severity} />
        </div>

        <div className={`edge-detail-categories`}>
          {entry.categories.map((cat) => (
            <span
              key={cat}
              className={`category-pill`}
              style={{ backgroundColor: CATEGORY_COLORS[cat] + '22', color: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] + '44' }}
            >
              {cat}
            </span>
          ))}
        </div>

        <div className={`edge-detail-notes`}>
          <p>{entry.notes}</p>
          <span className={`leverage-date`}>{entry.createdAt}</span>
        </div>
      </div>
    </div>
  );
}

function LeverageEntryCard({ entry, viewMode, getPersonById, sourcePerson }: { entry: LeverageEntry; viewMode: ViewMode; getPersonById: (id: string) => { name: string; avatarColor: string; initials: string } | undefined; sourcePerson?: { name: string; avatarColor: string; initials: string } }) {
  // For incoming entries, sourcePerson is the person who has dirt on the selected person.
  // For outgoing entries, we show the target (the person they have dirt on).
  const person = sourcePerson ?? getPersonById(entry.targetId);
  if (!person) return null;

  return (
    <div className={`leverage-entry`}>
      <div className={`leverage-entry-header`}>
        <div className={`leverage-entry-person`}>
          <div
            className={`leverage-avatar-tiny`}
            style={{ backgroundColor: person.avatarColor + '22', color: person.avatarColor, borderColor: person.avatarColor }}
          >
            {person.initials}
          </div>
          <span className={`leverage-entry-name`}>{person.name}</span>
        </div>
        <SeverityDots severity={entry.severity} />
      </div>
      <div className={`leverage-categories`}>
        {entry.categories.map((cat) => (
          <span
            key={cat}
            className={`category-pill`}
            style={{ backgroundColor: CATEGORY_COLORS[cat] + '22', color: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] + '44' }}
          >
            {cat}
          </span>
        ))}
      </div>
      {viewMode === 'private' && (
        <div className={`leverage-notes`}>
          <p>{entry.notes}</p>
          <span className={`leverage-date`}>{entry.createdAt}</span>
        </div>
      )}
      {viewMode === 'public' && (
        <div className={`leverage-notes-hidden`}>
          <span className={`hidden-indicator`}>
            <svg width={`12`} height={`12`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
              <path d={`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`} />
              <line x1={`1`} y1={`1`} x2={`23`} y2={`23`} />
            </svg>
            Hidden in public view
          </span>
        </div>
      )}
    </div>
  );
}

type Tab = 'has-on-others' | 'others-have-on-them';

export default function RightPanel() {
  const { state, dispatch, getPersonById, getConnectionCount, getVulnerabilityScore, getDangerScore, getIncomingEntries } = useNetwork();
  const [activeTab, setActiveTab] = useState<Tab>('has-on-others');
  const [aiInput, setAiInput] = useState('');

  const handleAiSubmit = () => {
    if (!aiInput.trim() || !state.selectedPersonId) return;
    const input = aiInput.trim();
    const lower = input.toLowerCase();

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
    <aside className={`right-panel`}>
      <div className={`right-panel-header`}>
        <div className={`profile-card`}>
          <div
            className={`profile-avatar`}
            style={{ backgroundColor: person.avatarColor + '22', color: person.avatarColor, borderColor: person.avatarColor }}
          >
            {person.initials}
          </div>
          <div className={`profile-info`}>
            <h2 className={`profile-name`}>{person.name}</h2>
            <div className={`profile-stats`}>
              <div className={`stat`}>
                <span className={`stat-value`}>{connectionCount}</span>
                <span className={`stat-label`}>Links</span>
              </div>
              <div className={`stat`}>
                <span className={`stat-value danger`}>{danger}</span>
                <span className={`stat-label`}>Danger</span>
              </div>
              <div className={`stat`}>
                <span className={`stat-value vulnerability`}>{vulnerability}</span>
                <span className={`stat-label`}>Exposure</span>
              </div>
            </div>
          </div>
        </div>
        <button
          className={`close-panel-btn`}
          onClick={() => {
            dispatch({ type: 'SET_RIGHT_PANEL', open: false });
            dispatch({ type: 'SELECT_PERSON', personId: null });
          }}
        >
          <svg width={`16`} height={`16`} viewBox={`0 0 24 24`} fill={`none`} stroke={`currentColor`} strokeWidth={`2`}>
            <line x1={`18`} y1={`6`} x2={`6`} y2={`18`} />
            <line x1={`6`} y1={`6`} x2={`18`} y2={`18`} />
          </svg>
        </button>
      </div>

      {/* Edge detail card — shown when an edge is selected in the graph */}
      {state.selectedEdgeId && (
        <EdgeDetailCard
          entryId={state.selectedEdgeId}
          people={state.people}
          getPersonById={getPersonById}
          onClose={() => dispatch({ type: 'SELECT_EDGE', edgeId: null })}
        />
      )}

      <div className={`panel-tabs`}>
        <button
          className={`panel-tab ${activeTab === 'has-on-others' ? 'active' : ''}`}
          onClick={() => setActiveTab('has-on-others')}
        >
          Has On Others
          <span className={`tab-count`}>{person.hasOnOthers.length}</span>
        </button>
        <button
          className={`panel-tab ${activeTab === 'others-have-on-them' ? 'active' : ''}`}
          onClick={() => setActiveTab('others-have-on-them')}
        >
          Others Have On Them
          <span className={`tab-count`}>{getIncomingEntries(person.id).reduce((sum, g) => sum + g.entries.length, 0)}</span>
        </button>
      </div>

      <div className={`panel-entries`}>
        {activeTab === 'has-on-others' && (
          <>
            {person.hasOnOthers.length === 0 ? (
              <div className={`empty-state`}>No leverage entries</div>
            ) : (
              person.hasOnOthers.map((entry) => (
                <LeverageEntryCard key={entry.id} entry={entry} viewMode={state.viewMode} getPersonById={getPersonById} />
              ))
            )}
          </>
        )}
        {activeTab === 'others-have-on-them' && (
          <>
            {(() => {
              const incomingGroups = getIncomingEntries(person.id);
              if (incomingGroups.length === 0) return <div className={`empty-state`}>No leverage entries</div>;
              return (
                <>
                  {incomingGroups.flatMap(({ sourceId, entries }) =>
                    entries.map((entry) => {
                      const source = getPersonById(sourceId);
                      return (
                        <LeverageEntryCard
                          key={entry.id}
                          entry={entry}
                          viewMode={state.viewMode}
                          getPersonById={getPersonById}
                          sourcePerson={source}
                        />
                      );
                    })
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      <div className={`panel-ai-input`}>
        <svg width={`14`} height={`14`} viewBox={`0 0 24 24`} fill={`none`} stroke={`#22d3ee`} strokeWidth={`2`}>
          <polygon points={`12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2`} />
        </svg>
        <input
          type={`text`}
          placeholder={`Describe in natural language...`}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
        />
      </div>
    </aside>
  );
}