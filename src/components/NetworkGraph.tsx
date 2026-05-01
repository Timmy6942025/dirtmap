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
}

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const { state, dispatch, getConnectionCount } = useNetwork();
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
    if (severity >= 4) return '#ef4444';
    if (severity >= 3) return '#f97316';
    return '#eab308';
  }, []);

  const getEdgeWidth = useCallback((severity: number) => {
    return 1 + severity * 0.6;
  }, []);

  // Build/rebuild the force simulation
  useEffect(() => {
    if (!svgRef.current || !dimensions.width || !dimensions.height) return;

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;
    const positionCache = positionCacheRef.current;

    // Check if we have cached positions for most nodes (indicates a rebuild, not first render)
    const hasCachedPositions = positionCache.size > 0;

    // Defs
    const defs = svg.append('defs');

    // Glow filter
    const glowFilter = defs.append('filter').attr('id', 'glow');
    glowFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Stronger glow for selected nodes
    const strongGlowFilter = defs.append('filter').attr('id', 'strong-glow');
    strongGlowFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', '6')
      .attr('result', 'coloredBlur');
    const feMerge2 = strongGlowFilter.append('feMerge');
    feMerge2.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

    // Grid pattern
    const gridPattern = defs
      .append('pattern')
      .attr('id', 'grid')
      .attr('width', 40)
      .attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse');
    gridPattern
      .append('path')
      .attr('d', 'M 40 0 L 0 0 0 40')
      .attr('fill', 'none')
      .attr('stroke', '#1a1a2e')
      .attr('stroke-width', '0.5');

    // Arrow markers per severity level
    [1, 2, 3, 4, 5].forEach((sev) => {
      const color = getEdgeColor(sev);
      defs
        .append('marker')
        .attr('id', `arrow-${sev}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', color)
        .attr('opacity', 0.8);
    });

    // Determine which nodes are within depth range of selected node (for dimming)
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

    // Build nodes — always show all, use positionCache to preserve positions
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

    // Build links — always show all
    const links: SimLink[] = [];
    allPeople.forEach((person) => {
      person.hasOnOthers.forEach((entry) => {
        const source = nodeMap.get(person.id);
        const target = nodeMap.get(entry.targetId);
        if (source && target) {
          links.push({
            source: source,
            target: target,
            severity: entry.severity,
            categories: entry.categories,
          });
        }
      });
    });

    // Main group with zoom
    const g = svg.append('g');

    // Grid background
    g.append('rect')
      .attr('width', 4000)
      .attr('height', 4000)
      .attr('x', -2000)
      .attr('y', -2000)
      .attr('fill', 'url(#grid)');

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);
    // Register zoom handle with context so ZoomControls can access it
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

    // Initial centering
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(1)
    );

    // Force simulation
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(120)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(35));

    // If positions were cached, start with very low alpha to prevent visible re-animation
    if (hasCachedPositions) {
      simulation.alpha(0.05).restart();
    }

    // Draw links
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => getEdgeColor(d.severity))
      .attr('stroke-width', (d) => getEdgeWidth(d.severity))
      .attr('marker-end', (d) => `url(#arrow-${d.severity})`)
      .attr('stroke-linecap', 'round');

    // Draw node groups
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

    // Node glow ring
    nodeGroup
      .append('circle')
      .attr('class', 'node-glow')
      .attr('r', 24)
      .attr('fill', 'none')
      .attr('stroke', (d) => d.avatarColor)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.3)
      .attr('filter', 'url(#glow)');

    // Node background circle
    nodeGroup
      .append('circle')
      .attr('class', 'node-bg')
      .attr('r', 20)
      .attr('fill', (d) => d.avatarColor)
      .attr('fill-opacity', 0.15)
      .attr('stroke', (d) => d.avatarColor)
      .attr('stroke-width', 2);

    // Node initials text
    nodeGroup
      .append('text')
      .text((d) => d.initials)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', (d) => d.avatarColor)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', monospace")
      .attr('pointer-events', 'none');

    // Connection count badge - single group
    const badgeGroup = nodeGroup
      .append('g')
      .attr('transform', 'translate(14, -14)');

    badgeGroup
      .append('circle')
      .attr('r', 8)
      .attr('fill', '#1a1a2e')
      .attr('stroke', '#2a2a4e')
      .attr('stroke-width', 1);

    badgeGroup
      .append('text')
      .text((d) => {
        const count = getConnectionCount(d.id);
        return count > 9 ? '9+' : count.toString();
      })
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#8b8ba0')
      .attr('font-size', '7px')
      .attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', 'SF Mono', monospace")
      .attr('pointer-events', 'none');

    // Node name label
    nodeGroup
      .append('text')
      .text((d) => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '36px')
      .attr('fill', '#8b8ba0')
      .attr('font-size', '10px')
      .attr('font-weight', '400')
      .attr('font-family', "'Inter', sans-serif")
      .attr('pointer-events', 'none');

    // Click handler for node selection
    nodeGroup.on('click', (_event, d) => {
      _event.stopPropagation();
      dispatch({ type: 'SELECT_PERSON', personId: d.id });
    });

    // Click on background to deselect
    svg.on('click', () => {
      dispatch({ type: 'SELECT_PERSON', personId: null });
    });

    // Selection and depth dimming
    const updateVisualState = () => {
      const hasSelection = state.selectedPersonId !== null;

      nodeGroup.each(function (d) {
        const isSelected = state.selectedPersonId === d.id;
        const isWithinDepth = !hasSelection || inDepthSet.has(d.id);
        const el = d3.select(this);

        el.select('.node-glow')
          .attr('stroke-opacity', isSelected ? 0.8 : isWithinDepth ? 0.3 : 0.08)
          .attr('filter', isSelected ? 'url(#strong-glow)' : 'url(#glow)');

        el.select('.node-bg')
          .attr('fill-opacity', isSelected ? 0.3 : isWithinDepth ? 0.15 : 0.04)
          .attr('stroke-width', isSelected ? 3 : isWithinDepth ? 2 : 1)
          .attr('stroke-opacity', isWithinDepth ? 1 : 0.15);

        // All text children
        el.selectAll('text')
          .attr('opacity', isWithinDepth ? 1 : 0.15);

        // Badge text inside g
        el.selectAll('g text')
          .attr('opacity', isWithinDepth ? 1 : 0.15);
      });

      link.attr('stroke-opacity', (d) => {
        if (!hasSelection) return 0.6;
        const sourceId = (d.source as SimNode).id;
        const targetId = (d.target as SimNode).id;
        const isConnected = sourceId === state.selectedPersonId || targetId === state.selectedPersonId;
        const bothInDepth = inDepthSet.has(sourceId) && inDepthSet.has(targetId);
        if (isConnected) return 0.9;
        if (bothInDepth) return 0.4;
        return 0.08;
      });
    };

    updateVisualState();

    // Tick update — also cache positions
    simulation.on('tick', () => {
      nodes.forEach((n) => {
        if (n.x != null && n.y != null) {
          positionCache.set(n.id, { x: n.x, y: n.y });
        }
      });

      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
      zoomRef.current = null;
    };
  }, [state.people, dimensions, state.networkDepth, state.selectedPersonId, dispatch, getEdgeColor, getEdgeWidth, getConnectionCount]);

  return (
    <div ref={containerRef} className="network-graph-container">
      <svg ref={svgRef} className="network-graph-svg" />
    </div>
  );
}
