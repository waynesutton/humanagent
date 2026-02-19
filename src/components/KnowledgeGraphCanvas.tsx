/**
 * Force-directed knowledge graph visualization.
 * Canvas-based, no external deps. Matches the site's dark design system.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import type { Id } from "../../convex/_generated/dataModel";

interface GraphNode {
  id: string;
  title: string;
  nodeType: string;
  tags: string[];
  linkedNodeIds: string[];
  // Simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface KnowledgeNodeInput {
  _id: Id<"knowledgeNodes">;
  title: string;
  nodeType: string;
  tags: string[];
  linkedNodeIds: Id<"knowledgeNodes">[];
  description: string;
}

interface Props {
  nodes: KnowledgeNodeInput[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
}

// Colors aligned to site's design tokens
const COLORS = {
  bg: "#121212",
  surface1: "#1a1a1a",
  surface2: "#262626",
  border: "#3a3a3a",
  ink0: "#f3f3f3",
  ink1: "#c9c9c9",
  ink2: "#a8a8a8",
  accent: "#ea5b26",
  accentDim: "rgba(234, 91, 38, 0.3)",
  edgeLine: "rgba(168, 168, 168, 0.15)",
  edgeActive: "rgba(234, 91, 38, 0.4)",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "#4a9eff",
  technique: "#10b981",
  reference: "#a78bfa",
  moc: "#ea5b26",
  claim: "#f59e0b",
  procedure: "#ec4899",
};

const BASE_RADIUS = 8;
const MOC_RADIUS = 14;
const LABEL_FONT = "11px -apple-system, BlinkMacSystemFont, sans-serif";
const HOVER_FONT = "12px -apple-system, BlinkMacSystemFont, sans-serif";

function buildGraph(
  inputNodes: KnowledgeNodeInput[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeIds = new Set(inputNodes.map((n) => n._id));
  const nodes: GraphNode[] = inputNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / inputNodes.length;
    const spread = Math.min(300, inputNodes.length * 25);
    return {
      id: n._id,
      title: n.title,
      nodeType: n.nodeType,
      tags: n.tags,
      linkedNodeIds: n.linkedNodeIds.map(String),
      x: Math.cos(angle) * spread + (Math.random() - 0.5) * 40,
      y: Math.sin(angle) * spread + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      radius: n.nodeType === "moc" ? MOC_RADIUS : BASE_RADIUS + Math.min(n.linkedNodeIds.length * 1.5, 8),
    };
  });

  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const n of inputNodes) {
    for (const linkedId of n.linkedNodeIds) {
      if (!nodeIds.has(linkedId)) continue;
      const key = [n._id, linkedId].sort().join("-");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ source: n._id, target: linkedId });
    }
  }

  return { nodes, edges };
}

// Force simulation tick
function tick(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number
) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const repulsion = (800 * alpha) / (dist * dist);
      dx = (dx / dist) * repulsion;
      dy = (dy / dist) * repulsion;
      a.vx -= dx;
      a.vy -= dy;
      b.vx += dx;
      b.vy += dy;
    }
  }

  // Attraction along edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const attraction = (dist - 120) * 0.005 * alpha;
    const fx = (dx / dist) * attraction;
    const fy = (dy / dist) * attraction;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Center gravity
  for (const node of nodes) {
    node.vx -= node.x * 0.001 * alpha;
    node.vy -= node.y * 0.001 * alpha;
  }

  // Apply velocities with damping
  for (const node of nodes) {
    node.vx *= 0.85;
    node.vy *= 0.85;
    node.x += node.vx;
    node.y += node.vy;

    // Soft bounds
    const padding = 50;
    const hw = width / 2 - padding;
    const hh = height / 2 - padding;
    if (node.x < -hw) node.vx += (-hw - node.x) * 0.1;
    if (node.x > hw) node.vx += (hw - node.x) * 0.1;
    if (node.y < -hh) node.vy += (-hh - node.y) * 0.1;
    if (node.y > hh) node.vy += (hh - node.y) * 0.1;
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  hoveredId: string | null,
  selectedId: string | null,
  camera: { x: number; y: number; zoom: number }
) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Camera transform
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  // Collect linked node IDs for hover/selection highlight
  const highlightIds = new Set<string>();
  const activeId = hoveredId || selectedId;
  if (activeId) {
    highlightIds.add(activeId);
    const activeNode = nodeMap.get(activeId);
    if (activeNode) {
      for (const lid of activeNode.linkedNodeIds) highlightIds.add(lid);
    }
  }

  // Draw edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;

    const isHighlighted =
      activeId && (highlightIds.has(edge.source) && highlightIds.has(edge.target));

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isHighlighted ? COLORS.edgeActive : COLORS.edgeLine;
    ctx.lineWidth = isHighlighted ? 1.5 : 0.5;
    ctx.stroke();
  }

  // Draw nodes
  for (const node of nodes) {
    const isSelected = selectedId === node.id;
    const isHovered = hoveredId === node.id;
    const isLinked = activeId ? highlightIds.has(node.id) : false;
    const color = NODE_TYPE_COLORS[node.nodeType] || COLORS.ink2;

    // Glow for active/hovered nodes
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      ctx.fillStyle = `${color}33`;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

    if (isSelected) {
      ctx.fillStyle = color;
      ctx.strokeStyle = COLORS.ink0;
      ctx.lineWidth = 2;
    } else if (isHovered) {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
    } else if (isLinked && activeId) {
      ctx.fillStyle = `${color}cc`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = `${color}88`;
      ctx.strokeStyle = `${color}44`;
      ctx.lineWidth = 0.5;
    }

    ctx.fill();
    ctx.stroke();

    // Labels
    const showLabel = !activeId || isLinked || isSelected || isHovered;
    if (showLabel) {
      ctx.font = isHovered || isSelected ? HOVER_FONT : LABEL_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = node.y + node.radius + 4;
      const label = node.title.length > 28 ? node.title.slice(0, 26) + "..." : node.title;

      // Text shadow for readability
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(label, node.x + 1, labelY + 1);

      ctx.fillStyle = isSelected || isHovered ? COLORS.ink0 : COLORS.ink1;
      ctx.fillText(label, node.x, labelY);
    }
  }

  // Hovered node tooltip
  if (hoveredId) {
    const node = nodeMap.get(hoveredId);
    if (node) {
      const tooltipX = node.x;
      const tooltipY = node.y - node.radius - 12;
      const typeLabel = node.nodeType.toUpperCase();
      const tagLabel = node.tags.slice(0, 3).join(", ");
      const text = tagLabel ? `${typeLabel} / ${tagLabel}` : typeLabel;

      ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      const metrics = ctx.measureText(text);
      const pad = 6;
      const boxW = metrics.width + pad * 2;
      const boxH = 18;

      ctx.fillStyle = COLORS.surface2;
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(tooltipX - boxW / 2, tooltipY - boxH, boxW, boxH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = COLORS.ink1;
      ctx.fillText(text, tooltipX, tooltipY - 3);
    }
  }
}

export function KnowledgeGraphCanvas({ nodes: inputNodes, selectedNodeId, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const graphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const alphaRef = useRef(1);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, cx: 0, cy: 0 });
  const sizeRef = useRef({ w: 800, h: 500 });

  // Rebuild graph when input changes
  useEffect(() => {
    const prev = graphRef.current;
    const graph = buildGraph(inputNodes);

    // Preserve positions of existing nodes
    if (prev.nodes.length > 0) {
      const oldMap = new Map(prev.nodes.map((n) => [n.id, n]));
      for (const node of graph.nodes) {
        const old = oldMap.get(node.id);
        if (old) {
          node.x = old.x;
          node.y = old.y;
          node.vx = old.vx;
          node.vy = old.vy;
        }
      }
    }

    graphRef.current = graph;
    alphaRef.current = 0.5;
  }, [inputNodes]);

  // Hit test: find node under screen coordinates
  const hitTest = useCallback((screenX: number, screenY: number): GraphNode | null => {
    const cam = cameraRef.current;
    const { w, h } = sizeRef.current;
    const worldX = (screenX - w / 2 - cam.x) / cam.zoom;
    const worldY = (screenY - h / 2 - cam.y) / cam.zoom;

    for (let i = graphRef.current.nodes.length - 1; i >= 0; i--) {
      const node = graphRef.current.nodes[i]!;
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const hitRadius = node.radius + 4;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return node;
    }
    return null;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        sizeRef.current = { w: width, h: height };
      }
    });

    resizeObserver.observe(container);

    function animate() {
      const { nodes, edges } = graphRef.current;
      const { w, h } = sizeRef.current;

      if (alphaRef.current > 0.001) {
        tick(nodes, edges, w, h, alphaRef.current);
        alphaRef.current *= 0.995;
      }

      draw(ctx!, nodes, edges, w, h, hoveredNodeId, selectedNodeId, cameraRef.current);
      animFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
    };
  }, [hoveredNodeId, selectedNodeId]);

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (draggingNodeId) {
        const cam = cameraRef.current;
        const { w, h } = sizeRef.current;
        const node = graphRef.current.nodes.find((n) => n.id === draggingNodeId);
        if (node) {
          node.x = (sx - w / 2 - cam.x) / cam.zoom;
          node.y = (sy - h / 2 - cam.y) / cam.zoom;
          node.vx = 0;
          node.vy = 0;
          alphaRef.current = Math.max(alphaRef.current, 0.05);
        }
        return;
      }

      if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        cameraRef.current.x = panStartRef.current.cx + dx;
        cameraRef.current.y = panStartRef.current.cy + dy;
        return;
      }

      const hit = hitTest(sx, sy);
      setHoveredNodeId(hit?.id ?? null);
    },
    [draggingNodeId, isPanning, hitTest]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const hit = hitTest(sx, sy);
      if (hit) {
        setDraggingNodeId(hit.id);
        alphaRef.current = Math.max(alphaRef.current, 0.1);
      } else {
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          cx: cameraRef.current.x,
          cy: cameraRef.current.y,
        };
      }
    },
    [hitTest]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggingNodeId) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const hit = hitTest(sx, sy);
          if (hit && hit.id === draggingNodeId) {
            onNodeClick(hit.id);
          }
        }
        setDraggingNodeId(null);
      }
      if (isPanning) {
        setIsPanning(false);
      }
    },
    [draggingNodeId, isPanning, hitTest, onNodeClick]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const cam = cameraRef.current;
    cam.zoom = Math.max(0.2, Math.min(3, cam.zoom * factor));
  }, []);

  return (
    <div ref={containerRef} className="relative h-[420px] w-full overflow-hidden rounded-lg border border-surface-3 bg-[#121212]">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: draggingNodeId ? "grabbing" : hoveredNodeId ? "pointer" : isPanning ? "grabbing" : "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredNodeId(null);
          setDraggingNodeId(null);
          setIsPanning(false);
        }}
        onWheel={handleWheel}
      />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
        {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-[10px] text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex gap-1">
        <button
          onClick={() => {
            cameraRef.current.zoom = Math.min(3, cameraRef.current.zoom * 1.2);
          }}
          className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1 hover:text-ink-0 transition-colors"
        >
          +
        </button>
        <button
          onClick={() => {
            cameraRef.current.zoom = Math.max(0.2, cameraRef.current.zoom * 0.8);
          }}
          className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1 hover:text-ink-0 transition-colors"
        >
          -
        </button>
        <button
          onClick={() => {
            cameraRef.current = { x: 0, y: 0, zoom: 1 };
            alphaRef.current = 0.3;
          }}
          className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1 hover:text-ink-0 transition-colors"
        >
          reset
        </button>
      </div>
    </div>
  );
}
