import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import edgehandles from 'cytoscape-edgehandles';
import { useNetwork } from '../store/NetworkContext';
import { useZoomContext } from '../store/ZoomContext';

// Register extensions
cytoscape.use(fcose);
cytoscape.use(edgehandles);

// Type augmentation for Cytoscape extensions
declare module 'cytoscape' {
  interface Core {
    edgehandles(options?: any): EdgeHandlesApi;
  }
}

interface EdgeHandlesApi {
  enableDrawMode(): void;
  disableDrawMode(): void;
  destroy(): void;
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const ehRef = useRef<EdgeHandlesApi | null>(null);

  const { state, dispatch } = useNetwork();
  const [nodeLabelData, setNodeLabelData] = useState<Record<string, { x: number; y: number; h: number }>>({});
  const { zoomRef } = useZoomContext();

  // Compute depth set — canonical BFS using only hasOnOthers (same as buildData)
  const inDepthSet = useMemo(() => {
    const s = new Set<string>();
    const selectedId = state.selectedPersonId;
    if (!selectedId) return s;

    // Build outgoing and incoming maps from all people
    const outgoingMap = new Map<string, Set<string>>();
    const incomingMap = new Map<string, Set<string>>();
    for (const p of state.people) {
      outgoingMap.set(p.id, new Set(p.hasOnOthers.map((e) => e.targetId)));
      for (const entry of p.hasOnOthers) {
        if (!incomingMap.has(entry.targetId)) incomingMap.set(entry.targetId, new Set());
        incomingMap.get(entry.targetId)!.add(p.id);
      }
    }

    const addReachable = (personId: string, hopsRemaining: number) => {
      if (s.has(personId) || hopsRemaining < 0) return;
      s.add(personId);
      if (hopsRemaining === 0) return;
      const outTargets = outgoingMap.get(personId);
      if (outTargets) {
        for (const t of outTargets) addReachable(t, hopsRemaining - 1);
      }
      const inTargets = incomingMap.get(personId);
      if (inTargets) {
        for (const t of inTargets) addReachable(t, hopsRemaining - 1);
      }
    };
    addReachable(selectedId, state.networkDepth);
    return s;
  }, [state.selectedPersonId, state.networkDepth, state.people]);

  // Update name overlay positions
  const rafIdRef = useRef<number>(0);
  const updateOverlayPositions = useCallback(() => {
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = 0;
      const cy = cyRef.current;
      if (!cy) return;
      const data: Record<string, { x: number; y: number; h: number }> = {};
      cy.nodes().forEach((node) => {
        const pos = node.renderedPosition();
        data[node.id()] = { x: pos.x, y: pos.y, h: node.renderedHeight() };
      });
      setNodeLabelData(data);
    });
  }, []);

  // ── Build data classification (reusable) ───────────
  // Canonical graph model: edges come ONLY from hasOnOthers.
  // We derive incoming relationships by reversing that map.
  // This ensures nodes and edges are always classified from the same source.
  const buildData = useCallback(() => {
    const selectedId = state.selectedPersonId;
    const allPeople = state.people;

    // Build outgoing map: sourceId -> targetId set
    const outgoingMap = new Map<string, Set<string>>();
    for (const p of allPeople) {
      outgoingMap.set(p.id, new Set(p.hasOnOthers.map((e) => e.targetId)));
    }

    // Build incoming map: targetId -> sourceId set (derived from hasOnOthers)
    const incomingMap = new Map<string, Set<string>>();
    for (const p of allPeople) {
      for (const entry of p.hasOnOthers) {
        if (!incomingMap.has(entry.targetId)) incomingMap.set(entry.targetId, new Set());
        incomingMap.get(entry.targetId)!.add(p.id);
      }
    }

    // BFS from selected person walking BOTH outgoing AND incoming edges
    // (include people they have leverage on AND people who have leverage on them)
    const localInDepthSet = new Set<string>();
    if (selectedId) {
      const addReachable = (personId: string, hopsRemaining: number) => {
        if (localInDepthSet.has(personId) || hopsRemaining < 0) return;
        localInDepthSet.add(personId);
        if (hopsRemaining === 0) return;
        const outTargets = outgoingMap.get(personId);
        if (outTargets) {
          for (const t of outTargets) addReachable(t, hopsRemaining - 1);
        }
        const inTargets = incomingMap.get(personId);
        if (inTargets) {
          for (const t of inTargets) addReachable(t, hopsRemaining - 1);
        }
      };
      addReachable(selectedId, state.networkDepth);
    }

    // Connection type map for node coloring
    const connectionTypeMap = new Map<string, 'outgoing' | 'incoming' | 'bidirectional' | 'none'>();
    if (selectedId) {
      const outIds = outgoingMap.get(selectedId) ?? new Set();
      const inIds = incomingMap.get(selectedId) ?? new Set();
      for (const p of allPeople) {
        if (p.id === selectedId) continue;
        const isOut = outIds.has(p.id);
        const isIn = inIds.has(p.id);
        connectionTypeMap.set(p.id, isOut && isIn ? 'bidirectional' : isOut ? 'outgoing' : isIn ? 'incoming' : 'none');
      }
    }

    const nodeData: Record<string, any> = {};
    const edgeData: any[] = [];

    // Node data
    for (const p of allPeople) {
      const connType = selectedId ? (connectionTypeMap.get(p.id) ?? 'none') : 'default';
      const isSel = p.id === selectedId;
      const inD = !selectedId || localInDepthSet.has(p.id);
      nodeData[p.id] = {
        initials: p.initials,
        avatarColor: p.avatarColor,
        connType,
        isSel: isSel ? 'true' : 'false',
        inD: inD ? 'true' : 'false',
      };
    }

    // Edge data — each leverage entry becomes an edge using entry.id as the edge id.
    // Track parallel edges (multiple entries between same source/target pair) and offset their curves.
    for (const person of allPeople) {
      // Group entries by target to count parallel edges
      const targetCounts = new Map<string, number>();
      for (const entry of person.hasOnOthers) {
        const count = targetCounts.get(entry.targetId) ?? 0;
        targetCounts.set(entry.targetId, count + 1);
      }

      // Track which index each target is at
      const targetIndices = new Map<string, number>();

      for (const entry of person.hasOnOthers) {
        const direction = selectedId
          ? person.id === selectedId ? 'outgoing'
            : entry.targetId === selectedId ? 'incoming'
            : 'default'
          : 'default';

        const bothInD = localInDepthSet.has(person.id) && localInDepthSet.has(entry.targetId);
        const isConnected = selectedId !== null && (person.id === selectedId || entry.targetId === selectedId);
        const isSelected = state.selectedEdgeId === entry.id;

        const totalBetweenPair = targetCounts.get(entry.targetId) ?? 1;
        const thisIndex = targetIndices.get(entry.targetId) ?? 0;
        targetIndices.set(entry.targetId, thisIndex + 1);

        edgeData.push({
          id: entry.id,
          source: person.id,
          target: entry.targetId,
          severity: entry.severity,
          direction,
          isConnected: isConnected ? 'true' : 'false',
          bothInD: bothInD ? 'true' : 'false',
          hasSel: selectedId ? 'true' : 'false',
          isSelected: isSelected ? 'true' : 'false',
          edgeIndex: thisIndex,
          totalParallel: totalBetweenPair,
        });
      }
    }

    return { nodeData, edgeData, hasSel: !!selectedId };
  }, [state.selectedPersonId, state.selectedEdgeId, state.networkDepth, state.people]);

  // ── Stylesheet ─────────────────────────────────────
  // Color layering: severity colors for default-direction edges; direction colors (outgoing/incoming) override on top.
  // Selected edge gets glow highlight. Parallel edges spread via control-point-offset.
  const buildStylesheet = useCallback(() => {
    return `
      node {
        label: data(initials);
        text-valign: center;
        text-halign: center;
        font-size: 14px;
        font-weight: 700;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        color: data(avatarColor);
        text-opacity: 1;
        background-color: #0f0f11;
        background-opacity: 1;
        border-width: 2;
        border-color: data(avatarColor);
        border-opacity: 0.5;
        width: 52;
        height: 52;
        text-outline-width: 0;
        overlay-padding: 10;
        transition-property: border-opacity, border-width, background-color, text-opacity;
        transition-duration: 0.2s;
      }
      node:hover {
        border-opacity: 0.9;
        border-width: 3;
        background-color: #18181b;
      }
      node[isSel='true'] {
        border-width: 3;
        border-opacity: 1;
        background-color: #18181b;
        text-opacity: 1;
        z-index: 10;
      }
      node[inD='false'] {
        border-opacity: 0.25;
        background-opacity: 0.3;
        text-opacity: 0.4;
      }
      node[connType='outgoing'] {
        border-color: #22d3ee;
        border-opacity: 0.8;
        text-opacity: 1;
      }
      node[connType='incoming'] {
        border-color: #f87171;
        border-opacity: 0.7;
        text-opacity: 1;
      }
      node[connType='bidirectional'] {
        border-color: #a78bfa;
        border-opacity: 0.8;
        text-opacity: 1;
      }
      /* ── Edges: base ───────────────────────── */
      edge {
        curve-style: bezier;
        control-point-step-size: 40;
        width: 1.5;
        line-color: #fbbf24;
        line-opacity: 0.75;
        target-arrow-shape: triangle;
        target-arrow-color: #fbbf24;
        arrow-scale: 1.3;
        source-arrow-shape: none;
        overlay-padding: 8;
        overlay-opacity: 0;
        transition-property: line-color, line-opacity, width, border-width, border-color;
        transition-duration: 0.2s;
        z-index: 1;
      }
      /* ── Severity colors (for direction='default' edges) ── */
      edge[direction='default'][severity >= 5] {
        line-color: #ef4444;
        target-arrow-color: #ef4444;
        width: 3.5;
      }
      edge[direction='default'][severity = 4] {
        line-color: #f87171;
        target-arrow-color: #f87171;
        width: 3;
      }
      edge[direction='default'][severity = 3] {
        line-color: #fb923c;
        target-arrow-color: #fb923c;
        width: 2.5;
      }
      edge[direction='default'][severity = 2] {
        line-color: #fbbf24;
        target-arrow-color: #fbbf24;
        width: 2;
      }
      edge[direction='default'][severity = 1] {
        line-color: #94a3b8;
        target-arrow-color: #94a3b8;
        width: 1.5;
        line-opacity: 0.65;
      }
      /* ── Direction colors (override severity for outgoing/incoming) ── */
      edge[direction='outgoing'] {
        line-color: #22d3ee;
        target-arrow-color: #22d3ee;
        line-opacity: 0.9;
        width: 3;
        line-style: dashed;
        line-dash-pattern: 10 5;
      }
      edge[direction='incoming'] {
        line-color: #f87171;
        target-arrow-color: #f87171;
        line-opacity: 0.85;
        width: 2.5;
        line-style: dashed;
        line-dash-pattern: 5 8;
      }
      /* ── Selected edge highlight ── */
      edge[isSelected='true'] {
        width: 5;
        line-opacity: 1;
        z-index: 100;
        border-width: 2;
        border-color: white;
        border-opacity: 0.6;
      }
      edge[isSelected='true'][direction='outgoing'] {
        line-color: #67e8f9;
        target-arrow-color: #67e8f9;
      }
      edge[isSelected='true'][direction='incoming'] {
        line-color: #fca5a5;
        target-arrow-color: #fca5a5;
      }
      /* ── Parallel edge offset ── */
      edge[totalParallel='1'] {
        control-point-offset: 0;
      }
      edge[totalParallel='2'][edgeIndex='0'] {
        control-point-offset: -35;
      }
      edge[totalParallel='2'][edgeIndex='1'] {
        control-point-offset: 35;
      }
      edge[totalParallel='3'][edgeIndex='0'] {
        control-point-offset: -45;
      }
      edge[totalParallel='3'][edgeIndex='1'] {
        control-point-offset: 0;
      }
      edge[totalParallel='3'][edgeIndex='2'] {
        control-point-offset: 45;
      }
      edge[totalParallel='4'][edgeIndex='0'] {
        control-point-offset: -50;
      }
      edge[totalParallel='4'][edgeIndex='1'] {
        control-point-offset: -17;
      }
      edge[totalParallel='4'][edgeIndex='2'] {
        control-point-offset: 17;
      }
      edge[totalParallel='4'][edgeIndex='3'] {
        control-point-offset: 50;
      }
      .eh-handle {
        background-color: #22d3ee;
        width: 12;
        height: 12;
        border-width: 0;
        label: '';
      }
      .eh-preview {
        line-color: #22d3ee;
        line-opacity: 0.5;
        target-arrow-color: #22d3ee;
        line-style: dashed;
      }
    `;
  }, []);

  // ── Initialize Cytoscape once ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { nodeData, edgeData } = buildData();
    const stylesheet = buildStylesheet();

    const elements: cytoscape.ElementDefinition[] = [];

    state.people.forEach((p) => {
      elements.push({ data: { id: p.id, ...nodeData[p.id] } });
    });

    edgeData.forEach((e) => {
      elements.push({ data: e });
    });

    const cy = cytoscape({
      container,
      elements,
      style: stylesheet as any,
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;

    // Initial layout
    const initialLayout = cy.layout({
      name: 'fcose',
      quality: 'default',
      randomize: true,
      animate: true,
      animationDuration: 700,
      animationEasing: 'ease-in-out-cubic',
      fit: true,
      padding: 50,
      nodeRepulsion: () => 45000,
      idealEdgeLength: () => 250,
      nodeSeparation: 200,
    } as any);
    initialLayout.run();
    initialLayout.one('layoutstop', () => updateOverlayPositions());

    // Edgehandles
    const eh = cy.edgehandles({
      enabled: false,
      canConnect: (sourceNode: any, targetNode: any) => sourceNode.id() !== targetNode.id(),
      edgeParams: () => ({
        data: {
          severity: 1,
          direction: 'default',
          isConnected: 'false',
          bothInD: 'true',
          hasSel: state.selectedPersonId ? 'true' : 'false',
        },
      }),
      hoverDelay: 150,
      snap: true,
      snapThreshold: 30,
      snapFrequency: 50,
      noEdgeEventsInDraw: true,
      disableBrowserGestures: true,
    } as any);
    ehRef.current = eh;

    // Shift key toggle
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && ehRef.current) ehRef.current.enableDrawMode();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && ehRef.current) ehRef.current.disableDrawMode();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ehcomplete → store
    cy.on('ehcomplete', (_evt: any, sourceNode: any, targetNode: any, addedEdge: any) => {
      if (addedEdge) {
        dispatch({
          type: 'ADD_CONNECTION',
          sourceId: sourceNode.id(),
          targetId: targetNode.id(),
          categories: [] as any[],
          severity: 1,
          notes: '',
        });
      }
    });

    // Zoom controls
    zoomRef.current = {
      zoomIn: () => {
        cy.zoom({ level: Math.min(cy.zoom() * 1.4, 4), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      zoomOut: () => {
        cy.zoom({ level: Math.max(cy.zoom() * 0.7, 0.2), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      resetZoom: () => {
        cy.fit(undefined, 50);
      },
    };

    // Node click → select person
    cy.on('tap', 'node', (evt) => {
      dispatch({ type: 'SELECT_PERSON', personId: evt.target.id() });
    });

    // Background tap → deselect person and edge
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        dispatch({ type: 'SELECT_PERSON', personId: null });
        dispatch({ type: 'SELECT_EDGE', edgeId: null });
      }
    });

    // Overlay position updates
    cy.on('viewport dragfree', () => updateOverlayPositions());

    // Marching ants animation
    let dashOffset = 0;
    const animInterval = setInterval(() => {
      dashOffset -= 1;
      cy.edges().forEach((edge) => {
        const dir = edge.data('direction');
        if (dir === 'outgoing' || dir === 'incoming') {
          (edge as any).style('line-dash-offset', dashOffset);
        }
      });
    }, 50);

    // Cleanup
    return () => {
      clearInterval(animInterval);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      eh.destroy();
      cy.destroy();
      cyRef.current = null;
      ehRef.current = null;
      zoomRef.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize once — never recreates

  // ── In-place update when state changes ─────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const { nodeData, edgeData } = buildData();
    const stylesheet = buildStylesheet();

    // Get current positions before any changes
    const currentPositions = new Map<string, { x: number; y: number }>();
    cy.nodes().forEach((n) => {
      const p = n.position();
      currentPositions.set(n.id(), { x: p.x, y: p.y });
    });

    // Update existing nodes — preserve positions, update data
    cy.nodes().forEach((node) => {
      const id = node.id();
      const data = nodeData[id];
      if (data) {
        node.data(data);
      } else {
        // Node no longer exists — remove
        node.remove();
      }
    });

    // Add new nodes that don't exist yet
    state.people.forEach((p) => {
      if (!cy.getElementById(p.id).length) {
        const pos = currentPositions.get(p.id);
        cy.add({
          group: 'nodes',
          data: { id: p.id, ...nodeData[p.id] },
          position: pos ? { x: pos.x, y: pos.y } : undefined,
        });
      }
    });

    // Build set of new edge IDs
    const newEdgeIds = new Set(edgeData.map((e) => e.id));

    // Remove edges that no longer exist
    cy.edges().forEach((edge) => {
      if (!newEdgeIds.has(edge.id())) {
        edge.remove();
      }
    });

    // Add or update edges
    edgeData.forEach((e) => {
      const existing = cy.getElementById(e.id);
      if (existing.length) {
        existing.data(e);
      } else {
        cy.add({ group: 'edges', data: e });
      }
    });

    // Update stylesheet — this is all we need on selection/deselect
    // Nodes stay exactly where they are, only visual dimming changes
    cy.style().fromString(stylesheet).update();

    // Edge tap → focus the connector. Auto-selects the source person so RightPanel shows
    // their full profile, and highlights the specific entry.
    cy.off('tap', 'edge');
    cy.on('tap', 'edge', (evt) => {
      const edgeId = evt.target.id();
      const sourceId = evt.target.data('source');
      // Toggle off if already selected, otherwise select the source person AND the edge
      if (state.selectedEdgeId === edgeId) {
        dispatch({ type: 'SELECT_EDGE', edgeId: null });
      } else {
        dispatch({ type: 'SELECT_PERSON', personId: sourceId });
        dispatch({ type: 'SELECT_EDGE', edgeId });
      }
    });

    // Update overlay labels immediately so new selection's name appears without drag
    updateOverlayPositions();

  }, [state.people, state.networkDepth, state.selectedPersonId, state.selectedEdgeId, dispatch, buildData, buildStylesheet, updateOverlayPositions]);



  const selectedId = state.selectedPersonId;

  return (
    <div className="network-graph-container">
      <div ref={containerRef} className="network-graph-cytoscape" />

      {/* Name label overlay — positioned below each Cytoscape node */}
      <div className="network-graph-overlay">
        {state.people.map((p) => {
          const nd = nodeLabelData[p.id];
          if (!nd) return null;
          const inD = !selectedId || inDepthSet.has(p.id);
          const isSelected = p.id === selectedId;
          const showLabel = inD || isSelected;

          return (
            <div
              key={p.id}
              className="node-name-label"
              style={{
                left: nd.x,
                top: nd.y + nd.h / 2 + 6,
                opacity: showLabel ? (selectedId ? 0.85 : 0.75) : 0,
              }}
            >
              {p.name.split(' ')[0]}
            </div>
          );
        })}
      </div>

      {/* Direction legend */}
      {selectedId && (
        <div className="direction-legend">
          <div className="legend-row">
            <span className="legend-line outgoing-line" />
            <span className="legend-text outgoing-text">HAS ON THEM →</span>
          </div>
          <div className="legend-row">
            <span className="legend-line incoming-line" />
            <span className="legend-text incoming-text">THEY HAVE ON ←</span>
          </div>
        </div>
      )}
    </div>
  );
}