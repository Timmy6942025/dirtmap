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
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const { state, dispatch } = useNetwork();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [nodeLabelData, setNodeLabelData] = useState<Record<string, { x: number; y: number; h: number }>>({});
  const { zoomRef } = useZoomContext();

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Memoized people map
  const peopleMap = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people]
  );

  // Compute depth set for overlay label visibility
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

  // Update name overlay positions — uses renderedHeight so offset scales with zoom
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

  // ── Main Cytoscape setup ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const selectedId = state.selectedPersonId;
    const allPeople = state.people;

    // ── Depth + connection classification ─────────────
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

    // ── Build Cytoscape elements ───────────────────────
    const elements: cytoscape.ElementDefinition[] = [];

    // Restore saved positions from previous instance to avoid layout jumps
    const savedPositions = savedPositionsRef.current;

    // Nodes
    allPeople.forEach((p) => {
      const connType = selectedId ? (connectionTypeMap.get(p.id) ?? 'none') : undefined;
      const isSel = p.id === selectedId;
      const inD = !selectedId || localInDepthSet.has(p.id);
      const saved = savedPositions[p.id];
      elements.push({
        data: {
          id: p.id,
          initials: p.initials,
          avatarColor: p.avatarColor,
          connType: connType ?? 'default',
          isSel: isSel ? 'true' : 'false',
          inD: inD ? 'true' : 'false',
        },
        position: saved ? { x: saved.x, y: saved.y } : undefined,
      });
    });

    // Edges — one per hasOnOthers entry, giving natural multigraph support
    // Cytoscape bezier + control-point-step-size separates bidirectional edges automatically
    const pairEdgeCount = new Map<string, number>();

    allPeople.forEach((person) => {
      person.hasOnOthers.forEach((entry) => {
        const pairKey = [person.id, entry.targetId].sort().join('-');
        const edgeIdx = pairEdgeCount.get(pairKey) ?? 0;
        pairEdgeCount.set(pairKey, edgeIdx + 1);

        // Determine direction for coloring
        let direction: string = 'default';
        if (selectedId) {
          if (person.id === selectedId) direction = 'outgoing';
          else if (entry.targetId === selectedId) direction = 'incoming';
        }

        const bothInD = localInDepthSet.has(person.id) && localInDepthSet.has(entry.targetId);
        const isConnected = selectedId !== null && (person.id === selectedId || entry.targetId === selectedId);

        elements.push({
          data: {
            id: `${person.id}->${entry.targetId}-${edgeIdx}`,
            source: person.id,
            target: entry.targetId,
            severity: entry.severity,
            direction,
            isConnected: isConnected ? 'true' : 'false',
            bothInD: bothInD ? 'true' : 'false',
            hasSel: selectedId ? 'true' : 'false',
          },
        });
      });
    });

    // ── Cytoscape stylesheet ───────────────────────────
    const stylesheet: any[] = [
      // ── Node styles ──
      {
        selector: 'node',
        style: {
          'label': 'data(initials)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '14px',
          'font-weight': 700,
          'font-family': "'JetBrains Mono', 'SF Mono', monospace",
          'color': 'data(avatarColor)',
          'text-opacity': 1,
          'background-color': '#0f0f11',
          'background-opacity': 1,
          'border-width': 2,
          'border-color': 'data(avatarColor)',
          'border-opacity': 0.5,
          'width': 52,
          'height': 52,
          'text-outline-width': 0,
          'overlay-padding': 10,
          'transition-property': 'border-opacity, border-width, background-color, text-opacity',
          'transition-duration': '0.2s',
        },
      },
      // Hover — brighter border and fill
      {
        selector: 'node:hover',
        style: {
          'border-opacity': 0.9,
          'border-width': 3,
          'background-color': '#18181b',
        },
      },
      // Selected node — thicker border, glow effect
      {
        selector: 'node[isSel = "true"]',
        style: {
          'border-width': 3,
          'border-opacity': 1,
          'background-color': '#18181b',
          'text-opacity': 1,
          'z-index': 10,
        },
      },
      // Nodes outside depth set — faded
      {
        selector: 'node[inD = "false"]',
        style: {
          'border-opacity': 0.08,
          'background-opacity': 0.15,
          'text-opacity': 0.15,
        },
      },
      // Connection type encoding
      {
        selector: 'node[connType = "outgoing"]',
        style: {
          'border-color': '#22d3ee',
          'border-opacity': 0.8,
          'text-opacity': 1,
        },
      },
      {
        selector: 'node[connType = "incoming"]',
        style: {
          'border-color': '#f87171',
          'border-opacity': 0.7,
          'text-opacity': 1,
        },
      },
      {
        selector: 'node[connType = "bidirectional"]',
        style: {
          'border-color': '#a78bfa',
          'border-opacity': 0.8,
          'text-opacity': 1,
        },
      },

      // ── Edge styles ──
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'control-point-step-size': 40,
          'width': 1.5,
          'line-color': '#fbbf24',
          'line-opacity': 0.55,
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#fbbf24',
          'arrow-scale': 1.3,
          'source-arrow-shape': 'none',
          'transition-property': 'line-color, line-opacity, width',
          'transition-duration': '0.2s',
        },
      },
      // Severity-based edge coloring
      {
        selector: 'edge[severity >= 4]',
        style: {
          'line-color': '#f87171',
          'target-arrow-color': '#f87171',
          'width': 3,
        },
      },
      {
        selector: 'edge[severity >= 3]',
        style: {
          'line-color': '#fb923c',
          'target-arrow-color': '#fb923c',
          'width': 2.5,
        },
      },
      // Outgoing edges from selected node — cyan, dashed marching ants
      {
        selector: 'edge[direction = "outgoing"]',
        style: {
          'line-color': '#22d3ee',
          'target-arrow-color': '#22d3ee',
          'line-opacity': 0.9,
          'width': 3,
          'line-style': 'dashed',
          'line-dash-pattern': [10, 5],
        },
      },
      // Incoming edges to selected node — red, dashed marching ants
      {
        selector: 'edge[direction = "incoming"]',
        style: {
          'line-color': '#f87171',
          'target-arrow-color': '#f87171',
          'line-opacity': 0.75,
          'width': 2.5,
          'line-style': 'dashed',
          'line-dash-pattern': [5, 8],
        },
      },
      // Connected but not directly outgoing/incoming (depth-2+ edges) — only when a node is selected
      {
        selector: 'edge[hasSel = "true"][isConnected = "true"][direction = "default"]',
        style: {
          'line-opacity': 0.25,
        },
      },
      // Both endpoints in depth set, not directly connected to selected — only dim when selected
      {
        selector: 'edge[hasSel = "true"][bothInD = "true"][isConnected = "false"]',
        style: {
          'line-opacity': 0.15,
        },
      },
      // Edges outside depth set — nearly invisible, only when a node is selected
      {
        selector: 'edge[hasSel = "true"][bothInD = "false"][isConnected = "false"]',
        style: {
          'line-opacity': 0.04,
          'target-arrow-opacity': 0.04,
        },
      },

      // ── Edgehandles styles ──
      {
        selector: '.eh-handle',
        style: {
          'background-color': '#22d3ee',
          'width': 12,
          'height': 12,
          'border-width': 0,
          'label': '',
        },
      },
      {
        selector: '.eh-preview',
        style: {
          'line-color': '#22d3ee',
          'line-opacity': 0.5,
          'target-arrow-color': '#22d3ee',
          'line-style': 'dashed',
        },
      },
    ];

    // ── Determine layout ──────────────────────────────
    // Always use the intended layout (fcose/concentric) but seed positions from savedPositions
    // so the layout converges quickly from previous positions, avoiding layout jumps
    // while still producing the correct layout for the current mode.
    const hasSavedPositions = Object.keys(savedPositions).length > 0;

    const layoutOpts: any = {
      name: selectedId ? 'concentric' : 'fcose',
      quality: 'default',
      randomize: !hasSavedPositions, // only randomize on first render
      animate: true,
      animationDuration: hasSavedPositions ? 300 : 600, // faster when re-positioning
      animationEasing: 'ease-in-out-cubic',
      fit: true,
      padding: 50,
      // fcose-specific
      ...(selectedId
        ? {}
        : {
            nodeRepulsion: () => 45000,
            idealEdgeLength: () => 250,
            nodeSeparation: 200,
          }),
      // concentric-specific
      ...(selectedId
        ? {
            concentric: (node: any) => {
              if (node.data('id') === selectedId) return 10;
              const conn = node.data('connType');
              if (conn === 'bidirectional') return 7;
              if (conn === 'outgoing' || conn === 'incoming') return 5;
              if (localInDepthSet.has(node.data('id'))) return 3;
              return 1;
            },
            levelWidth: (nodes: any) => nodes.length / 4,
            spacingFactor: 1.2,
            startAngle: -Math.PI / 2,
          }
        : {}),
    };

    // ── Create Cytoscape instance ──────────────────────
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: stylesheet,
      layout: layoutOpts,
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;

    // ── Edgehandles (disabled by default, activated via Shift key) ──
    const eh = cy.edgehandles({
      enabled: false,
      canConnect: (sourceNode: any, targetNode: any) => {
        return sourceNode.id() !== targetNode.id();
      },
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
    });

    ehRef.current = eh;

    // Toggle edgehandles with Shift key
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && ehRef.current) ehRef.current.enableDrawMode();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && ehRef.current) ehRef.current.disableDrawMode();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Persist edges created via edgehandles to the store
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

    // ── Register zoom controls ─────────────────────────
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

    // ── Node click → select person ─────────────────────
    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      dispatch({ type: 'SELECT_PERSON', personId: nodeId });
    });

    // Click background → deselect
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        dispatch({ type: 'SELECT_PERSON', personId: null });
      }
    });

    // ── Update overlay positions on viewport/position changes ──
    cy.on('viewport dragfree', () => updateOverlayPositions());
    // Also update during layout animation
    const layoutInterval = setInterval(() => updateOverlayPositions(), 50);
    cy.one('layoutstop', () => {
      clearInterval(layoutInterval);
      updateOverlayPositions();
    });

    // ── Animated marching-ant dash offset ──────────────
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

    // ── Cleanup ────────────────────────────────────────
    return () => {
      // Save node positions before destroying to preserve layout across re-renders
      const positions: Record<string, { x: number; y: number }> = {};
      cy.nodes().forEach((node) => {
        const pos = node.position();
        positions[node.id()] = { x: pos.x, y: pos.y };
      });
      savedPositionsRef.current = positions;

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
  }, [state.people, dimensions, state.networkDepth, state.selectedPersonId, dispatch, peopleMap, updateOverlayPositions]);

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
                top: nd.y + nd.h / 2 + 6, // scales with zoom since renderedHeight scales
                opacity: showLabel ? (selectedId ? 0.85 : 0.75) : 0,
              }}
            >
              {p.name.split(' ')[0]}
            </div>
          );
        })}
      </div>

      {/* Direction legend — shown when a node is selected */}
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
