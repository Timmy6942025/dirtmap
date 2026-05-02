import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Person, ViewMode, FilterType, NetworkState, LeverageEntry, LeverageCategory, Severity } from '../types';
import { mockPeople } from '../data/mockData';
import { v4 as uuidv4 } from 'uuid';

type Action =
  | { type: 'SELECT_PERSON'; personId: string | null }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_ACTIVE_FILTER'; filter: FilterType }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_RIGHT_PANEL'; open: boolean }
  | { type: 'SET_NETWORK_DEPTH'; depth: number }
  | { type: 'TOGGLE_AI_CHAT' }
  | { type: 'TOGGLE_LEGEND' }
  | { type: 'ADD_PERSON'; person: Person }
  | { type: 'ADD_LEVERAGE'; sourceId: string; entry: LeverageEntry }
  | { type: 'ADD_CONNECTION'; sourceId: string; targetId: string; categories: LeverageCategory[]; severity: Severity; notes: string }

const initialState: NetworkState = {
  people: mockPeople,
  selectedPersonId: null,
  viewMode: 'public',
  searchQuery: '',
  activeFilter: 'all',
  sidebarCollapsed: false,
  rightPanelOpen: false,
  networkDepth: 1,
  aiChatOpen: false,
  legendCollapsed: true,
};

function networkReducer(state: NetworkState, action: Action): NetworkState {
  switch (action.type) {
    case 'SELECT_PERSON':
      return {
        ...state,
        selectedPersonId: action.personId,
        rightPanelOpen: action.personId !== null,
      };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query };
    case 'SET_ACTIVE_FILTER':
      return { ...state, activeFilter: action.filter };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_RIGHT_PANEL':
      return { ...state, rightPanelOpen: action.open };
    case 'SET_NETWORK_DEPTH':
      return { ...state, networkDepth: action.depth };
    case 'TOGGLE_AI_CHAT':
      return { ...state, aiChatOpen: !state.aiChatOpen };
    case 'TOGGLE_LEGEND':
      return { ...state, legendCollapsed: !state.legendCollapsed };
    case 'ADD_PERSON':
      return { ...state, people: [...state.people, action.person] };
    case 'ADD_LEVERAGE':
      return {
        ...state,
        people: state.people.map((p) =>
          p.id === action.sourceId
            ? { ...p, hasOnOthers: [...p.hasOnOthers, action.entry] }
            : p
        ),
      };
    case 'ADD_CONNECTION': {
      const newEntry: LeverageEntry = {
        id: uuidv4(),
        targetId: action.targetId,
        categories: action.categories,
        severity: action.severity,
        notes: action.notes,
        createdAt: new Date().toISOString().split('T')[0],
      };
      const reciprocalEntry: LeverageEntry = {
        id: uuidv4(),
        targetId: action.sourceId,
        categories: action.categories,
        severity: action.severity,
        notes: action.notes,
        createdAt: new Date().toISOString().split('T')[0],
      };
      return {
        ...state,
        people: state.people.map((p) => {
          if (p.id === action.sourceId) {
            return { ...p, hasOnOthers: [...p.hasOnOthers, newEntry] };
          }
          if (p.id === action.targetId) {
            return { ...p, othersHaveOnThem: [...p.othersHaveOnThem, reciprocalEntry] };
          }
          return p;
        }),
      };
    }
    default:
      return state;
  }
}

interface NetworkContextType {
  state: NetworkState;
  dispatch: React.Dispatch<Action>;
  getFilteredPeople: () => Person[];
  getPersonById: (id: string) => Person | undefined;
  getConnectionCount: (personId: string) => number;
  getVulnerabilityScore: (personId: string) => number;
  getDangerScore: (personId: string) => number;
  getIncomingEntries: (personId: string) => { sourceId: string; entries: LeverageEntry[] }[];
}

const NetworkContext = createContext<NetworkContextType | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(networkReducer, initialState);

  const getPersonById = useCallback(
    (id: string) => state.people.find((p) => p.id === id),
    [state.people]
  );

  const getConnectionCount = useCallback(
    (personId: string) => {
      const person = state.people.find((p) => p.id === personId);
      if (!person) return 0;
      const outIds = new Set(person.hasOnOthers.map((l) => l.targetId));
      const inIds = new Set(person.othersHaveOnThem.map((l) => l.targetId));
      return outIds.size + inIds.size;
    },
    [state.people]
  );

  const getVulnerabilityScore = useCallback(
    (personId: string) => {
      const person = state.people.find((p) => p.id === personId);
      if (!person) return 0;
      return person.othersHaveOnThem.reduce((sum, l) => sum + l.severity, 0);
    },
    [state.people]
  );

  const getDangerScore = useCallback(
    (personId: string) => {
      const person = state.people.find((p) => p.id === personId);
      if (!person) return 0;
      return person.hasOnOthers.reduce((sum, l) => sum + l.severity, 0);
    },
    [state.people]
  );

  // Compute incoming entries from the canonical hasOnOthers source.
  // Returns a list of {sourceId, entries} so the RightPanel can show who's targeting this person.
  const getIncomingEntries = useCallback(
    (personId: string) => {
      // Collect all hasOnOthers entries that target this personId
      const incomingMap = new Map<string, LeverageEntry[]>();
      for (const p of state.people) {
        for (const entry of p.hasOnOthers) {
          if (entry.targetId === personId) {
            if (!incomingMap.has(p.id)) incomingMap.set(p.id, []);
            incomingMap.get(p.id)!.push(entry);
          }
        }
      }
      // Return sorted by source name
      return Array.from(incomingMap.entries())
        .map(([sourceId, entries]) => ({ sourceId, entries }))
        .sort((a, b) => {
          const nameA = state.people.find((p) => p.id === a.sourceId)?.name ?? '';
          const nameB = state.people.find((p) => p.id === b.sourceId)?.name ?? '';
          return nameA.localeCompare(nameB);
        });
    },
    [state.people]
  );

  const getFilteredPeople = useCallback(() => {
    let people = state.people;

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      people = people.filter((p) => p.name.toLowerCase().includes(q));
    }

    switch (state.activeFilter) {
      case 'most-connected':
        return [...people].sort(
          (a, b) => getConnectionCount(b.id) - getConnectionCount(a.id)
        );
      case 'most-vulnerable':
        return [...people].sort(
          (a, b) => getVulnerabilityScore(b.id) - getVulnerabilityScore(a.id)
        );
      case 'most-dangerous':
        return [...people].sort(
          (a, b) => getDangerScore(b.id) - getDangerScore(a.id)
        );
      default:
        return people;
    }
  }, [state.people, state.searchQuery, state.activeFilter, getConnectionCount, getVulnerabilityScore, getDangerScore]);

  return (
    <NetworkContext.Provider
      value={{ state, dispatch, getFilteredPeople, getPersonById, getConnectionCount, getVulnerabilityScore, getDangerScore, getIncomingEntries }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
