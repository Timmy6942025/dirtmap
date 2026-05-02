export type LeverageCategory =
  | 'Crush'
  | 'Past Experience'
  | 'Photo'
  | 'Quote'
  | 'Secret'
  | 'Financial'
  | 'Relationship'
  | 'Career'
  | 'Reputation';

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface LeverageEntry {
  id: string;
  targetId: string;
  categories: LeverageCategory[];
  severity: Severity;
  notes: string;
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  hasOnOthers: LeverageEntry[];
  othersHaveOnThem: LeverageEntry[];
}

export type ViewMode = 'public' | 'private';
export type FilterType = 'all' | 'most-connected' | 'most-vulnerable' | 'most-dangerous';

export interface NetworkState {
  people: Person[];
  selectedPersonId: string | null;
  selectedEdgeId: string | null; // edge being inspected in detail
  viewMode: ViewMode;
  searchQuery: string;
  activeFilter: FilterType;
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  networkDepth: number;
  aiChatOpen: boolean;
  legendCollapsed: boolean;
}
