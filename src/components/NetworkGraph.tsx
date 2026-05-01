import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useNetwork } from '../store/NetworkContext';
import { useZoomContext } from '../store/ZoomContext';
import type { Person } from '../types';

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  person: Person;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  severity: number;
  categories: string[];
  curvature: number; // how much to arc this link
  linkIndex: number; // which parallel link this is
}

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const { state, dispatch } = useNetwork();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const { zoomRef } = useZoomContext();

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const getEdgeColor = useCallback((severity: number) => {
    if (severity >= 4) return '#f87171';
    if (severity >= 3) return '#fb923c';
    return '#fbbf24';
  }, []);

  // Build/rebuild the force simulation
  useEffect(() => {
    if (!svgRef.current || !dimensions.width || !dimensions.height) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;
    const positionCache = positionCacheRef.current;
    const hasCachedPositions = positionCache.size > 0;

    // ── Defs ──────────────────────────────────────────
    const defs = svg.append('defs');

    // Dot grid pattern
    const gridPattern = defs
      .append('pattern')
      .attr('id', 'dot-grid')
      .attr('width', 24)
      .attr('height', 24)
      .attr('patternUnits', 'userSpaceOnUse');
    gridPattern
      .append('circle')
      .attr('cx', 12)
      .attr('cy', 12)
      .attr('r', 0.6)
      .attr('fill', 'rgba(255,255,255,0.04)');

    // Pulse animation for selected node
    const pulseFilter = defs.append('filter').attr('id', 'pulse-glow');
    pulseFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    const feMerge = pulseFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers per severity — small, subtle
    [1, 2, 3, 4, 5].forEach((sev) => {
      const color = getEdgeColor(sev);
      defs
        .append('marker')
        .attr('id', `arrow-${sev}`)
        .attr('viewBox', '0 -3 6 6')
        .attr('refX', 30)
        .attr('refY', 0)
        .attr('markerWidth', 4)
        .attr('markerHeight', 4)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-2L4,0L0,2')
        .attr('fill', color)
        .attr('opacity', 0.7);
    });

    // ── Depth calculation ─────────────────────────────
    const allPeople = state.people;
    const peopleMap = new Map(allPeople.map((p) => [p.id, p]));
    const inDepthSet = new Set<string>();

    if (state.selectedPersonId) {
      const addReachable = (personId: string, hopsRemaining: number) => {
        if (inDepthSet.has(personId) || hopsRemaining < 0) return;
        inDepthSet.add(personId);
        if (hopsRemaining === 0) return;
        const person = peopleMap.get(personId);
        if (!person) return;
        for (const entry of person.hasOnOthers) {
          addReachable(entry.targetId, hopsRemaining - 1);
        }
        for (const entry of person.othersHaveOnThem) {
          addReachable(entry.targetId, hopsRemaining - 1);
        }
      };
      addReachable(state.selectedPersonId, state.networkDepth);
    }

    // ── Build nodes ────────────────────────────────────
    const nodes: SimNode[] = allPeople.map((p) => {
      const cached = positionCache.get(p.id);
      return {
        id: p.id,
        name: p.name,
        initials: p.initials,
        avatarColor: p.avatarColor,
        person: p,
        x: cached?.x ?? width / 2 + (Math.random() - 0.5) * 300,
        y: cached?.y ?? height / 2 + (Math.random() - 0.5) * 300,
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // ── Build links with curvature for parallel edges ──
    // Group links by source-target pair to compute curvature offsets
    const linkPairs = new Map<string, number>(); // "sourceId-targetId" → count
    const links: SimLink[] = [];

    allPeople.forEach((person) => {
      person.hasOnOthers.forEach((entry) => {
        const source = nodeMap.get(person.id);
        const target = nodeMap.get(entry.targetId);
        if (source && target) {
          const pairKey = [person.id, entry.targetId].sort().join('-');
          const pairIndex = linkPairs.get(pairKey) ?? 0;
          linkPairs.set(pairKey, pairIndex + 1);

          // Determine direction: if source.id < target.id, curvature is positive; else negative
          // This ensures bidirectional edges curve in opposite directions
          const sameDirection = person.id < entry.targetId;
          const curvatureBase = 0.15;
          const curvature = sameDirection
            ? curvatureBase + pairIndex * 0.12
            : -(curvatureBase + pairIndex * 0.12);

          links.push({
            source: source,
            target: target,
            severity: entry.severity,
            categories: entry.categories,
            curvature,
            linkIndex: pairIndex,
          });
        }
      });
    });

    // ── Main group with zoom ───────────────────────────
    const g = svg.append('g');

    // Dot grid background
    g.append('rect')
      .attr('width', 6000)
      .attr('height', 6000)
      .attr('x', -3000)
      .attr('y', -3000)
      .attr('fill', 'url(#dot-grid)');

    // ── Zoom ──────────────────────────────────────────
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);
    zoomRef.current = {
      zoomIn: () => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        d3.select(svgEl).transition().duration(300).call(zoom.scaleBy, 1.4);
      },
      zoomOut: () => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        d3.select(svgEl).transition().duration(300).call(zoom.scaleBy, 0.7);
      },
      resetZoom: () => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        d3.select(svgEl).transition().duration(500).call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
        );
      },
    };

    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
    );

    // ── Force simulation ───────────────────────────────
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(180)
          .strength(0.4)
      )
      .force('charge', d3.forceManyBody().strength(-700))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(55));

    if (hasCachedPositions) {
      simulation.alpha(0.05).restart();
    }

    // ── Draw links as curved paths ─────────────────────
    const linkPath = g
      .append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => getEdgeColor(d.severity))
      .attr('stroke-width', (d) => 1 + d.severity * 0.4)
      .attr('marker-end', (d) => `url(#arrow-${d.severity})`)
      .attr('stroke-linecap', 'round');

    // ── Draw nodes ─────────────────────────────────────
    const nodeGroup = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'grab')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Outer ring — thin colored border
    nodeGroup
      .append('circle')
      .attr('class', 'node-ring')
      .attr('r', 22)
      .attr('fill', 'transparent')
      .attr('stroke', (d) => d.avatarColor)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.4);

    // Inner fill — subtle tinted background
    nodeGroup
      .append('circle')
      .attr('class', 'node-fill')
      .attr('r', 22)
      .attr('fill', (d) => d.avatarColor)
      .attr('fill-opacity', 0.08);

    // Initials text
    nodeGroup
      .append('text')
      .attr('class', 'node-initials')
      .text((d) => d.initials)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', (d) => d.avatarColor)
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', monospace")
      .attr('pointer-events', 'none');

    // First name label — shown only for selected/connected nodes
    nodeGroup
      .append('text')
      .attr('class', 'node-label')
      .text((d) => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '38px')
      .attr('fill', '#a1a1aa')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .attr('font-family', "'Manrope', sans-serif")
      .attr('pointer-events', 'none')
      .attr('opacity', 0); // hidden by default

    // Hover area (invisible, larger hit target)
    nodeGroup
      .append('circle')
      .attr('r', 30)
      .attr('fill', 'transparent')
      .attr('cursor', 'grab');

    // ── Click handlers ─────────────────────────────────
    nodeGroup.on('click', (_event, d) => {
      _event.stopPropagation();
      dispatch({ type: 'SELECT_PERSON', personId: d.id });
    });

    svg.on('click', () => {
      dispatch({ type: 'SELECT_PERSON', personId: null });
    });

    // ── Selection state + trail animation ──────────────
    const updateVisualState = () => {
      const hasSelection = state.selectedPersonId !== null;

      // Node visual state
      nodeGroup.each(function (d) {
        const isSelected = state.selectedPersonId === d.id;
        const isWithinDepth = !hasSelection || inDepthSet.has(d.id);
        const el = d3.select(this);

        // Ring
        el.select('.node-ring')
          .attr('stroke-opacity', isSelected ? 1 : isWithinDepth ? 0.4 : 0.06)
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
          .attr('filter', isSelected ? 'url(#pulse-glow)' : 'none');

        // Fill
        el.select('.node-fill')
          .attr('fill-opacity', isSelected ? 0.2 : isWithinDepth ? 0.08 : 0.02);

        // Initials
        el.select('.node-initials')
          .attr('opacity', isWithinDepth ? 1 : 0.1);

        // Name label — show for selected + connected nodes
        el.select('.node-label')
          .attr('opacity', isSelected || (isWithinDepth && hasSelection) ? 1 : 0);
      });

      // Link visual state + animated trails for connected edges
      linkPath.each(function (d) {
        const sourceId = (d.source as SimNode).id;
        const targetId = (d.target as SimNode).id;
        const isConnected = hasSelection && (sourceId === state.selectedPersonId || targetId === state.selectedPersonId);
        const bothInDepth = inDepthSet.has(sourceId) && inDepthSet.has(targetId);
        const el = d3.select(this);

        if (isConnected) {
          // Animated trail: flowing dashes along the path
          el.attr('stroke-opacity', 0.85)
            .attr('stroke-dasharray', '6 4')
            .classed('trail-active', true);
        } else if (bothInDepth && hasSelection) {
          el.attr('stroke-opacity', 0.25)
            .attr('stroke-dasharray', 'none')
            .classed('trail-active', false);
        } else if (hasSelection) {
          el.attr('stroke-opacity', 0.04)
            .attr('stroke-dasharray', 'none')
            .classed('trail-active', false);
        } else {
          // No selection — all edges visible, no animation
          el.attr('stroke-opacity', 0.4)
            .attr('stroke-dasharray', 'none')
            .classed('trail-active', false);
        }
      });
    };

    updateVisualState();

    // ── Bézier curve path generator ─────────────────────
    // Computes a curved path between source and target
    const linkPathGenerator = (d: SimLink) => {
      const source = d.source as SimNode;
      const target = d.target as SimNode;
      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const dr = Math.max(Math.sqrt(dx * dx + dy * dy) / Math.abs(d.curvature || 0.15), 200);

      // Sweep flag determines which side the curve arcs toward
      const sweep = d.curvature > 0 ? 1 : 0;

      return `M${source.x ?? 0},${source.y ?? 0}A${dr},${dr} 0 0,${sweep} ${target.x ?? 0},${target.y ?? 0}`;
    };

    // ── Tick update ────────────────────────────────────
    simulation.on('tick', () => {
      nodes.forEach((n) => {
        if (n.x != null && n.y != null) {
          positionCache.set(n.id, { x: n.x, y: n.y });
        }
      });

      // Update curved paths
      linkPath.attr('d', linkPathGenerator);

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
      zoomRef.current = null;
    };
  }, [state.people, dimensions, state.networkDepth, state.selectedPersonId, dispatch, getEdgeColor]);

  return (
    <div ref={containerRef} className="network-graph-container">
      <svg ref={svgRef} className="network-graph-svg" />
    </div>
  );
}
