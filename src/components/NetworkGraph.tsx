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

  // Memoized people map
  const peopleMap = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people]
  );

  // Compute depth set
  const inDepthSet = useMemo(() => {
    const s = new Set<string>();
    const selectedId = state.selectedPersonId;
    if (!selectedId) return s;
    const addReachable = (personId: string, hopsRemaining: number) => {
      if (s.has(personId) || hopsRemaining < 0) return;
      s.add(personId);
      if (hopsRemaining === 0) return;
      const person = peopleMap.get(personId);
      if (!person) return;
      for (const entry of person.hasOnOthers) addReachable(entry.targetId, hopsRemaining - 1);
      for (const entry of person.othersHaveOnThem) addReachable(entry.targetId, hopsRemaining - 1);
    };
    addReachable(selectedId, state.networkDepth);
    return s;
  }, [state.selectedPersonId, state.networkDepth, peopleMap]);

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
  const buildData = useCallback(() => {
    const selectedId = state.selectedPersonId;
    const allPeople = state.people;

    const localInDepthSet = new Set<string>();
    if (selectedId) {
      const addReachable = (personId: string, hopsRemaining: number) => {
        if (localInDepthSet.has(personId) || hopsRemaining < 0) return;
        localInDepthSet.add(personId);
        if (hopsRemaining === 0) return;
        const person = peopleMap.get(personId);
        if (!person) return;
        for (const entry of person.hasOnOthers) addReachable(entry.targetId, hopsRemaining - 1);
        for (const entry of person.othersHaveOnThem) addReachable(entry.targetId, hopsRemaining - 1);
      };
      addReachable(selectedId, state.networkDepth);
    }

    const connectionTypeMap = new Map<string, 'outgoing' | 'incoming' | 'bidirectional' | 'none'>();
    if (selectedId) {
      const sp = peopleMap.get(selectedId);
      if (sp) {
        const outIds = new Set(sp.hasOnOthers.map((e) => e.targetId));
        const inIds = new Set(sp.othersHaveOnThem.map((e) => e.targetId));
        for (const p of allPeople) {
          if (p.id === selectedId) continue;
          const isOut = outIds.has(p.id);
          const isIn = inIds.has(p.id);
          connectionTypeMap.set(p.id, isOut && isIn ? 'bidirectional' : isOut ? 'outgoing' : isIn ? 'incoming' : 'none');
        }
      }
    }

    const pairEdgeCount = new Map<string, number>();
    const nodeData: Record<string, any> = {};
    const edgeData: any[] = [];

    allPeople.forEach((p) => {
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
    });

    allPeople.forEach((person) => {
      person.hasOnOthers.forEach((entry) => {
        const pairKey = [person.id, entry.targetId].sort().join('-');
        const edgeIdx = pairEdgeCount.get(pairKey) ?? 0;
        pairEdgeCount.set(pairKey, edgeIdx + 1);

        let direction = 'default';
        if (selectedId) {
          if (person.id === selectedId) direction = 'outgoing';
          else if (entry.targetId === selectedId) direction = 'incoming';
        }

        const bothInD = localInDepthSet.has(person.id) && localInDepthSet.has(entry.targetId);
        const isConnected = selectedId !== null && (person.id === selectedId || entry.targetId === selectedId);

        edgeData.push({
          id: `${person.id}->${entry.targetId}-${edgeIdx}`,
          source: person.id,
          target: entry.targetId,
          severity: entry.severity,
          direction,
          isConnected: isConnected ? 'true' : 'false',
          bothInD: bothInD ? 'true' : 'false',
          hasSel: selectedId ? 'true' : 'false',
        });
      });
    });

    return { nodeData, edgeData, hasSel: !!selectedId };
  }, [state.selectedPersonId, state.networkDepth, state.people, peopleMap]);

  // ── Stylesheet ─────────────────────────────────────
  const buildStylesheet = useCallback((hasSel: boolean) => {
    const dimRule = hasSel ? `
      edge[hasSel='true'][isConnected='true'][direction='default'] {
        line-opacity: 0.25;
      }
      edge[hasSel='true'][bothInD='true'][isConnected='false'] {
        line-opacity: 0.15;
      }
      edge[hasSel='true'][bothInD='false'][isConnected='false'] {
        line-opacity: 0.04;
        target-arrow-opacity: 0.04;
      }
    ` : '';

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
        border-opacity: 0.08;
        background-opacity: 0.15;
        text-opacity: 0.15;
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
      edge {
        curve-style: bezier;
        control-point-step-size: 40;
        width: 1.5;
        line-color: #fbbf24;
        line-opacity: 0.55;
        target-arrow-shape: triangle;
        target-arrow-color: #fbbf24;
        arrow-scale: 1.3;
        source-arrow-shape: none;
        transition-property: line-color, line-opacity, width;
        transition-duration: 0.2s;
      }
      edge[severity >= 4] {
        line-color: #f87171;
        target-arrow-color: #f87171;
        width: 3;
      }
      edge[severity >= 3] {
        line-color: #fb923c;
        target-arrow-color: #fb923c;
        width: 2.5;
      }
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
        line-opacity: 0.75;
        width: 2.5;
        line-style: dashed;
        line-dash-pattern: 5 8;
      }
      ${dimRule}
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

  // ── Layout options ─────────────────────────────────
  const buildLayoutOpts = useCallback((cy: cytoscape.Core, selectedId: string | null) => {
    const currentPositions = cy.nodes().map((n) => ({
      id: n.id(),
      x: n.position().x,
      y: n.position().y,
    }));
    const hasPositions = currentPositions.length > 0 && currentPositions.some((p) => p.x !== 0 || p.y !== 0);

    const layoutName = selectedId ? 'concentric' : 'fcose';

    const base = {
      name: layoutName,
      quality: 'default' as const,
      animate: true,
      animationDuration: hasPositions ? 400 : 700,
      animationEasing: 'ease-in-out-cubic',
      fit: true,
      padding: 50,
    };

    if (selectedId) {
      return {
        ...base,
        concentric: (node: cytoscape.NodeSingular) => {
          if (node.data('id') === selectedId) return 10;
          const conn = node.data('connType');
          if (conn === 'bidirectional') return 7;
          if (conn === 'outgoing' || conn === 'incoming') return 5;
          if (node.data('inD') === 'true') return 3;
          return 1;
        },
        levelWidth: (nodes: cytoscape.Collection) => Math.max(1, nodes.length / 5),
        spacingFactor: 2.0,
        startAngle: -Math.PI / 2,
        sort: (a: cytoscape.NodeSingular, b: cytoscape.NodeSingular) => {
          // Keep selected node at the center
          if (a.data('id') === selectedId) return -1;
          if (b.data('id') === selectedId) return 1;
          // Sort remaining by concentric level
          return (b.data('connType') === 'bidirectional' ? 1 : 0) - (a.data('connType') === 'bidirectional' ? 1 : 0);
        },
      };
    } else {
      return {
        ...base,
        nodeRepulsion: () => 45000,
        idealEdgeLength: () => 250,
        nodeSeparation: 200,
      };
    }
  }, []);

  // ── Initialize Cytoscape once ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { nodeData, edgeData, hasSel } = buildData();
    const stylesheet = buildStylesheet(hasSel);

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

    // Node click → select
    cy.on('tap', 'node', (evt) => {
      dispatch({ type: 'SELECT_PERSON', personId: evt.target.id() });
    });

    // Background tap → deselect
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        dispatch({ type: 'SELECT_PERSON', personId: null });
      }
    });

    // Overlay position updates
    cy.on('viewport dragfree', () => updateOverlayPositions());
    const layoutInterval = setInterval(() => updateOverlayPositions(), 50);

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
      clearInterval(layoutInterval);
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

    const { nodeData, edgeData, hasSel } = buildData();
    const stylesheet = buildStylesheet(hasSel);

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

    // Update stylesheet
    cy.style().fromString(stylesheet).update();

    // Re-run layout from current positions (no destroy/recreate)
    const layoutOpts = buildLayoutOpts(cy, state.selectedPersonId);
    const layout = cy.layout(layoutOpts as any);

    // Update overlay during animation
    const updateInterval = setInterval(() => updateOverlayPositions(), 50);
    layout.one('layoutstop', () => {
      clearInterval(updateInterval);
      updateOverlayPositions();
    });
    layout.run();

  }, [state.people, state.networkDepth, state.selectedPersonId, dispatch, buildData, buildStylesheet, buildLayoutOpts, updateOverlayPositions]);



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