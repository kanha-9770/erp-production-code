"use client";

// React Flow's stylesheet — static import so Next.js bundles it as CSS.
// The JS runtime for React Flow + dagre is still lazy-loaded below.
import "@xyflow/react/dist/style.css";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileDown,
  FileImage,
  Copy,
  FileJson,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import VisualToolbar from "./visual-toolbar";
import { svgToPngBlob, blobToDataUrl } from "@/lib/visual-export";

// Lazy-load the (heavy) React Flow + dagre bundles only when a flowmap is
// actually rendered. Saves ~150 KB from the initial chat bundle.
type RFModule = typeof import("@xyflow/react");
type DagreModule = typeof import("dagre");
let loaderPromise: Promise<{ rf: RFModule; dagre: DagreModule }> | null = null;
function loadDeps() {
  if (!loaderPromise) {
    loaderPromise = Promise.all([
      import("@xyflow/react"),
      import("dagre"),
    ]).then(([rf, dagre]) => ({ rf, dagre: dagre.default ?? dagre }));
  }
  return loaderPromise;
}

export interface FlowmapNode {
  id: string;
  label: string;
  kind?: string;
  description?: string;
}
export interface FlowmapEdge {
  from: string;
  to: string;
  label?: string;
  /** Optional visual cue: "solid" (default) | "dashed". */
  style?: "solid" | "dashed";
}
export interface FlowmapSpec {
  title?: string;
  description?: string;
  /** Layout direction: "TB" top-bottom, "LR" left-right (default). */
  direction?: "TB" | "LR" | "BT" | "RL";
  nodes: FlowmapNode[];
  edges: FlowmapEdge[];
}

export function parseFlowmapSpec(raw: string): FlowmapSpec | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const spec = parsed as Partial<FlowmapSpec>;
    if (!Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) return null;
    const nodes = spec.nodes
      .filter(
        (n): n is FlowmapNode =>
          !!n && typeof n === "object" && typeof n.id === "string"
      )
      .map((n) => ({ id: n.id, label: n.label ?? n.id, kind: n.kind, description: n.description }));
    const edges = spec.edges
      .filter(
        (e): e is FlowmapEdge =>
          !!e && typeof e === "object" && typeof e.from === "string" && typeof e.to === "string"
      )
      .map((e) => ({ from: e.from, to: e.to, label: e.label, style: e.style }));
    if (nodes.length === 0) return null;
    return {
      title: spec.title,
      description: spec.description,
      direction: spec.direction ?? "LR",
      nodes,
      edges,
    };
  } catch {
    return null;
  }
}

function safeFilename(title: string): string {
  return (
    (title || "flowmap")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "-")
      .trim()
      .toLowerCase() || "flowmap"
  );
}
function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Palette for node "kind" tags. Same warm / analytic colors we use on KPIs
// and charts so everything stays visually consistent.
const KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  module: { bg: "#FFF4EE", border: "#C96442", text: "#8B3D1F" },
  form: { bg: "#F4EAFE", border: "#8B5CF6", text: "#5B21B6" },
  field: { bg: "#ECFEFF", border: "#06B6D4", text: "#0E7490" },
  formula: { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" },
  lookup: { bg: "#D1FAE5", border: "#10B981", text: "#065F46" },
  record: { bg: "#FCE7F3", border: "#EC4899", text: "#9D174D" },
  user: { bg: "#DBEAFE", border: "#3B82F6", text: "#1E3A8A" },
};
function kindStyle(kind?: string): {
  bg: string;
  border: string;
  text: string;
} {
  if (!kind) return { bg: "#FAF9F5", border: "#C9BFA8", text: "#2B251F" };
  return (
    KIND_COLORS[kind.toLowerCase()] ?? {
      bg: "#FAF9F5",
      border: "#C9BFA8",
      text: "#2B251F",
    }
  );
}

interface Props {
  spec: FlowmapSpec;
  height?: number;
}

function FlowmapRendererImpl({ spec, height = 420 }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [deps, setDeps] = useState<{ rf: RFModule; dagre: DagreModule } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDeps()
      .then((d) => {
        if (!cancelled) setDeps(d);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message || "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!deps) return { nodes: [], edges: [] };
    const { dagre } = deps;
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: spec.direction ?? "LR",
      ranksep: 60,
      nodesep: 30,
      marginx: 8,
      marginy: 8,
    });

    const NODE_W = 180;
    const NODE_H = 46;
    for (const n of spec.nodes) {
      g.setNode(n.id, { width: NODE_W, height: NODE_H });
    }
    for (const [i, e] of spec.edges.entries()) {
      g.setEdge(e.from, e.to, {}, `e${i}`);
    }
    try {
      dagre.layout(g);
    } catch {
      /* ignore — malformed graphs just render at 0,0 */
    }

    const rfNodes = spec.nodes.map((n) => {
      const laid = g.node(n.id) as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      const s = kindStyle(n.kind);
      return {
        id: n.id,
        type: "default" as const,
        position: {
          x: laid ? laid.x - NODE_W / 2 : 0,
          y: laid ? laid.y - NODE_H / 2 : 0,
        },
        data: { label: n.label, kind: n.kind, description: n.description },
        style: {
          background: s.bg,
          border: `1.5px solid ${s.border}`,
          color: s.text,
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 500,
          width: NODE_W,
          textAlign: "center" as const,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        },
      };
    });

    const rfEdges = spec.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      label: e.label,
      labelStyle: { fontSize: 10, fill: "#6B6760", fontWeight: 500 },
      labelBgStyle: { fill: "#FAF9F5", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      type: "smoothstep" as const,
      animated: e.style === "dashed",
      style: {
        stroke: "#9A8F7E",
        strokeWidth: 1.4,
        strokeDasharray: e.style === "dashed" ? "4 4" : undefined,
      },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [deps, spec]);

  const title = spec.title ?? "Flowmap";

  const runExport = useCallback(
    async (fn: () => Promise<void> | void, name: string) => {
      try {
        await fn();
        toast.success(`${name} downloaded`);
      } catch (err) {
        toast.error(`${name} failed: ${(err as Error).message}`);
      }
    },
    []
  );

  const findSvg = useCallback((): SVGElement | null => {
    return wrapperRef.current?.querySelector("svg") ?? null;
  }, []);

  const downloadSVG = useCallback(async () => {
    const svg = findSvg();
    if (!svg) throw new Error("Flowmap not rendered");
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    downloadBlob(
      new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
      `${safeFilename(title)}-${timestampSlug()}.svg`
    );
  }, [findSvg, title]);

  const downloadPNG = useCallback(async () => {
    const svg = findSvg();
    if (!svg) throw new Error("Flowmap not rendered");
    const blob = await svgToPngBlob(svg as SVGElement);
    downloadBlob(blob, `${safeFilename(title)}-${timestampSlug()}.png`);
  }, [findSvg, title]);

  const downloadPDF = useCallback(async () => {
    const svg = findSvg();
    if (!svg) throw new Error("Flowmap not rendered");
    const { jsPDF } = await import("jspdf");
    const blob = await svgToPngBlob(svg as SVGElement);
    const dataUrl = await blobToDataUrl(blob);
    const bbox = (svg as SVGElement).getBoundingClientRect();
    const doc = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: bbox.width >= bbox.height ? "landscape" : "portrait",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    doc.setFillColor(201, 100, 66);
    doc.rect(0, 0, pageW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 25, 20);
    doc.text(title, margin, margin + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(140, 135, 130);
    doc.text(`Exported ${new Date().toLocaleString()}`, margin, margin + 22);
    const targetW = pageW - margin * 2;
    const targetH = Math.min(
      pageH - margin * 2 - 40,
      (bbox.height / bbox.width) * targetW
    );
    doc.addImage(dataUrl, "PNG", margin, margin + 36, targetW, targetH);
    doc.save(`${safeFilename(title)}-${timestampSlug()}.pdf`);
  }, [findSvg, title]);

  const copyJSON = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    toast.success("Flowmap JSON copied");
  }, [spec]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Flowmap failed to render</div>
          <div className="text-destructive/80 mt-0.5">{error}</div>
        </div>
      </div>
    );
  }

  const ReactFlow = deps?.rf.ReactFlow;
  const Background = deps?.rf.Background;
  const Controls = deps?.rf.Controls;
  const MiniMap = deps?.rf.MiniMap;

  return (
    <div
      data-visual-kind="flowmap"
      data-visual-title={title}
      className="group relative my-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm overflow-hidden"
    >
      <VisualToolbar
        label="Download flowmap"
        groups={[
          {
            label: "Flowmap",
            items: [
              {
                label: "PDF report",
                icon: <FileDown className="h-3.5 w-3.5" />,
                onSelect: () => runExport(downloadPDF, "PDF"),
              },
              {
                label: "PNG image",
                icon: <FileImage className="h-3.5 w-3.5" />,
                onSelect: () => runExport(downloadPNG, "PNG"),
              },
              {
                label: "SVG (vector)",
                icon: <FileJson className="h-3.5 w-3.5" />,
                onSelect: () => runExport(downloadSVG, "SVG"),
              },
            ],
          },
          {
            items: [
              {
                label: "Copy JSON",
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: copyJSON,
              },
            ],
          },
        ]}
      />

      {(spec.title || spec.description) && (
        <div className="mb-2 px-1 pr-10">
          {spec.title && (
            <div className="text-sm font-semibold text-foreground">
              {spec.title}
            </div>
          )}
          {spec.description && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {spec.description}
            </div>
          )}
        </div>
      )}

      <div
        ref={wrapperRef}
        style={{ width: "100%", height }}
        className="relative bg-background/50 rounded-md border border-border/40"
      >
        {!deps && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading flowmap…
          </div>
        )}
        {ReactFlow && Background && Controls && MiniMap ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnScroll
            zoomOnScroll
          >
            <Background gap={16} size={1} color="#E7DFC9" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                kindStyle((n.data as { kind?: string } | undefined)?.kind).border
              }
              nodeStrokeWidth={2}
              maskColor="rgba(250,249,245,0.6)"
              style={{
                background: "#FAF9F5",
                border: "1px solid #E7DFC9",
              }}
            />
          </ReactFlow>
        ) : null}
      </div>
    </div>
  );
}

export const FlowmapRenderer = memo(FlowmapRendererImpl);
export default FlowmapRenderer;
