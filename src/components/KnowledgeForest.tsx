import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { ForceGraphMethods } from "react-force-graph-3d";
import * as THREE from "three";
import * as d3 from "d3";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { GraphData, GraphNode } from "../types";

interface KnowledgeForestProps {
  data: GraphData;
  onNodeClick: (node: GraphNode) => void;
  onNodeRightClick: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  expandingNodeId?: string | null;
}

interface GraphErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

interface GraphErrorBoundaryState {
  hasError: boolean;
}

class GraphErrorBoundary extends React.Component<
  GraphErrorBoundaryProps,
  GraphErrorBoundaryState
> {
  constructor(props: GraphErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!context;
  } catch {
    return false;
  }
}

const textureLoader = new THREE.TextureLoader();
const spriteMap = textureLoader.load(
  "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/disc.png",
);

const labelRenderer = new CSS2DRenderer();

export function KnowledgeForest({
  data,
  onNodeClick,
  onNodeRightClick,
  onNodeDoubleClick,
  expandingNodeId,
}: KnowledgeForestProps) {
  const graphRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [rendererError, setRendererError] = useState("");
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const fireflies = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        left: `${8 + Math.random() * 84}%`,
        top: `${10 + Math.random() * 72}%`,
        size: 1.5 + Math.random() * 3,
        duration: 4 + Math.random() * 6,
        delay: Math.random() * 5,
        hue: Math.random() > 0.5 ? "#7c3aed" : "#06b6d4",
      })),
    [],
  );

  useEffect(() => {
    setWebglReady(canUseWebGL());
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!graphRef.current || dimensions.width <= 0) return;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(dimensions.width, dimensions.height),
      1.6,
      0.6,
      0.15,
    );

    try {
      const composer = graphRef.current.postProcessingComposer();
      composer.passes = composer.passes.filter((p) => !(p instanceof UnrealBloomPass));
      composer.addPass(bloomPass);
    } catch {
      // post-processing may not be available in some runtime contexts
    }

    graphRef.current.d3Force("charge")?.strength(-340);
    graphRef.current.d3Force("link")?.distance((link: any) => {
      if (link.source?.type === "root") return 180;
      return 100;
    });
    graphRef.current.d3Force("collision", d3.forceCollide(26));
    graphRef.current.d3Force("x", d3.forceX(0).strength(0.06));
    graphRef.current.d3Force("y", d3.forceY((n: any) => (n.type === "root" ? 220 : -120)).strength(0.08));
    graphRef.current.d3Force("center", d3.forceCenter(0, 0));
  }, [dimensions]);

  useEffect(() => {
    if (!graphRef.current) return;
    const root = data.nodes.find((n) => n.type === "root");
    if (!root) return;
    const r: any = root;
    r.fx = 0;
    r.fy = 230;
    r.fz = 0;
    graphRef.current.d3ReheatSimulation();
  }, [data]);

  useEffect(() => {
    if (!graphRef.current) return;

    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      const t = frame / 8;
      const windX = Math.sin(t * 0.08) * 25;
      graphRef.current?.d3Force("x", d3.forceX(windX).strength(0.04));
      graphRef.current?.d3ReheatSimulation();
    }, 1200);

    return () => window.clearInterval(timer);
  }, []);

  const nodeObject = useMemo(() => {
    return (node: any) => {
      const isRoot = node.type === "root" || node.nodeKind === "seed";
      const isGap = node.nodeKind === "gap";
      const isCompleted = !!node.completed || node.type === "flower";
      const isLeaf = node.type === "leaf";
      const isFruit = node.type === "fruit";
      const isHovered = hoveredId === node.id;
      const isExpanding = expandingNodeId === node.id;

      const baseColor = isRoot
        ? "#f59e0b"
        : isCompleted
          ? "#ec4899"
          : isFruit
            ? "#ef4444"
            : isLeaf
              ? "#8b5cf6"
              : isGap
                ? "#7c3aed"
                : "#06b6d4";

      let geometry: THREE.BufferGeometry;
      if (isLeaf) geometry = new THREE.TetrahedronGeometry(6);
      else if (isCompleted) geometry = new THREE.OctahedronGeometry(8);
      else if (isFruit) geometry = new THREE.IcosahedronGeometry(7);
      else if (isRoot) geometry = new THREE.DodecahedronGeometry(13);
      else if (isGap) geometry = new THREE.OctahedronGeometry(5);
      else geometry = new THREE.SphereGeometry(5, 16, 16);

      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: isCompleted ? 2.5 : isRoot ? 2.2 : isGap ? 1.6 : 1.2,
        transparent: isGap,
        opacity: isGap ? 0.75 : 1,
        roughness: 0.25,
        metalness: 0.4,
      });

      const mesh = new THREE.Mesh(geometry, material);
      const rootPulse = isRoot ? 1 + Math.sin(Date.now() / 240) * 0.12 : 1;
      const expandPulse = isExpanding ? 1 + Math.sin(Date.now() / 110) * 0.22 : 1;
      const scale = rootPulse * expandPulse;
      mesh.scale.set(scale, scale, scale);

      const glowSize = isRoot ? 42 : isExpanding ? 34 : isCompleted ? 30 : isGap ? 28 : 24;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spriteMap,
          color: baseColor,
          transparent: true,
          opacity: isExpanding ? 0.9 : isCompleted ? 0.78 : isRoot ? 0.85 : 0.5,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.set(glowSize, glowSize, 1);

      const group = new THREE.Group();
      group.add(mesh);
      group.add(glow);

      if (isHovered && (node.summary || node.text || node.label)) {
        const el = document.createElement("div");
        el.style.background = "rgba(6, 13, 26, 0.92)";
        el.style.border = `1px solid ${isGap ? "rgba(124,58,237,0.6)" : "rgba(6,182,212,0.5)"}`;
        el.style.borderRadius = "10px";
        el.style.padding = "8px 12px";
        el.style.color = "#f1f5f9";
        el.style.fontSize = "11px";
        el.style.maxWidth = "240px";
        el.style.lineHeight = "1.5";
        el.style.fontFamily = "Inter, sans-serif";
        el.style.backdropFilter = "blur(8px)";
        el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.5)";

        const labelEl = document.createElement("div");
        labelEl.style.fontWeight = "700";
        labelEl.style.marginBottom = "3px";
        labelEl.style.color = isGap ? "#c4b5fd" : "#67e8f9";
        labelEl.textContent = node.label || "";
        el.appendChild(labelEl);

        const snippet = document.createElement("div");
        snippet.style.opacity = "0.8";
        snippet.textContent = (node.summary || node.text || "").slice(0, 140);
        el.appendChild(snippet);

        const label = new CSS2DObject(el);
        label.position.set(0, 18, 0);
        group.add(label);
      }

      return group;
    };
  }, [hoveredId, expandingNodeId]);

  const webglUnavailable = webglReady === false || rendererFailed;
  const fallbackNodes = useMemo(
    () => [...data.nodes].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 18),
    [data.nodes],
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#02040a",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(124,58,237,0.15)",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12) 0%, rgba(6,182,212,0.05) 35%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "15%",
            transform: "translate(-50%,-50%)",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "1px solid rgba(124,58,237,0.15)",
            boxShadow: "0 0 40px rgba(124,58,237,0.08)",
          }}
        />
        {fireflies.map((f) => (
          <span
            key={f.id}
            className="firefly"
            style={{
              left: f.left,
              top: f.top,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              background: f.hue,
              boxShadow: `0 0 6px ${f.hue}`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {!webglUnavailable && dimensions.width > 0 && webglReady !== null && (
        <GraphErrorBoundary
          fallback={null}
          onError={(error) => {
            setRendererFailed(true);
            setRendererError(error.message || "WebGL renderer failed");
          }}
        >
          <ForceGraph3D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={data}
            backgroundColor="#010913"
            extraRenderers={[labelRenderer]}
            nodeThreeObject={nodeObject}
            nodeThreeObjectExtend={false}
            linkColor={(link: any) => {
              const src = link.source as any;
              const tgt = link.target as any;
              if (src?.type === "root") return "rgba(245,158,11,0.45)";
              if (tgt?.nodeKind === "gap") return "rgba(124,58,237,0.5)";
              if (tgt?.type === "flower" || tgt?.completed) return "rgba(236,72,153,0.45)";
              if (tgt?.type === "leaf") return "rgba(139,92,246,0.5)";
              return "rgba(6,182,212,0.3)";
            }}
            linkWidth={(link: any) => {
              const src = link.source as any;
              if (src?.type === "root") return 3;
              return 1.5;
            }}
            linkDirectionalParticles={(link: any) => {
              const tgt = link.target as any;
              if (tgt?.nodeKind === "gap") return 5;
              if (tgt?.type === "flower") return 3;
              return 2;
            }}
            linkDirectionalParticleColor={(link: any) => {
              const src = link.source as any;
              const tgt = link.target as any;
              if (src?.type === "root") return "#f59e0b";
              if (tgt?.nodeKind === "gap") return "#7c3aed";
              if (tgt?.completed) return "#ec4899";
              return "#06b6d4";
            }}
            linkDirectionalParticleWidth={(link: any) => {
              const tgt = link.target as any;
              return tgt?.nodeKind === "gap" ? 2.5 : 1.5;
            }}
            linkDirectionalParticleSpeed={0.006}
            onNodeHover={(node: any) => setHoveredId(node ? node.id : null)}
            onNodeDragEnd={(node: any) => {
              node.fx = node.x;
              node.fy = node.y;
              node.fz = node.z;
            }}
            onBackgroundClick={() => {
              lastClickRef.current = null;
            }}
            onNodeClick={(node: any) => {
              const now = Date.now();
              if (
                onNodeDoubleClick &&
                lastClickRef.current &&
                lastClickRef.current.id === node.id &&
                now - lastClickRef.current.time < 300
              ) {
                onNodeDoubleClick(node);
                lastClickRef.current = null;
                return;
              }

              lastClickRef.current = { id: node.id, time: now };
              onNodeClick(node);
            }}
            onNodeRightClick={(node: any) => onNodeRightClick(node)}
            controlType="trackball"
          />
        </GraphErrorBoundary>
      )}

      {webglUnavailable && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "linear-gradient(180deg, rgba(2,4,10,0.9), rgba(2,4,10,0.96))",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#fcd34d",
              border: "1px solid rgba(245,158,11,0.3)",
              background: "rgba(245,158,11,0.08)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            3D view unavailable (WebGL disabled in this environment). Fallback mode is active.
          </div>
          {rendererError && (
            <div
              style={{
                fontSize: 10,
                color: "var(--vv-text-muted)",
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {rendererError}
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--vv-text-secondary)" }}>
            Click node to inspect. Double-click node to expand. Right-click to prune.
          </div>

          <div
            style={{
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
              paddingBottom: 8,
            }}
          >
            {fallbackNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => onNodeClick(node)}
                onDoubleClick={() => onNodeDoubleClick?.(node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onNodeRightClick(node);
                }}
                style={{
                  textAlign: "left",
                  border: "1px solid var(--vv-border-subtle)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--vv-text-primary)",
                  padding: "10px 12px",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{node.label}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--vv-text-muted)",
                    lineHeight: 1.4,
                    maxHeight: 42,
                    overflow: "hidden",
                  }}
                >
                  {node.summary || node.text || "No summary available"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 12,
          fontSize: 9,
          fontFamily: "JetBrains Mono, monospace",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(148,163,184,0.35)",
          pointerEvents: "none",
        }}
      >
        {webglUnavailable
          ? "Fallback mode: click inspect � double-click expand � right-click prune"
          : "Click: tool action � Double-click: expand � Drag: reposition � Right-click: prune"}
      </div>
    </div>
  );
}
