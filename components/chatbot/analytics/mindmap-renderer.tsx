"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FileDown,
  FileImage,
  Copy,
  FileText,
  AlertCircle,
  Maximize2,
  MinusSquare,
  PlusSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import VisualToolbar from "./visual-toolbar";
import { cn } from "@/lib/utils";
import { svgToPngBlob, blobToDataUrl } from "@/lib/visual-export";

/*
 * NotebookLM-style interactive mindmap.
 *
 * Supports two layouts:
 *   - "TB" (top-to-bottom) — vertical tree, default. Root on top, children
 *     fan downward; chevrons sit below each expandable node.
 *   - "LR" (left-to-right) — horizontal tree. Root on the left, children
 *     fan rightward; chevrons sit beside each expandable node.
 *
 * Visual design matches Google NotebookLM's "Mind Map" widget:
 *   - Pill-shaped lavender nodes
 *   - External chevron buttons that expand/collapse each branch
 *   - Soft curved (bezier) edges
 *
 * Input: the same markdown outline the LLM already emits. Headings (`#`,
 * `##`, `###`) and bullets (`-`, `*`, `+`) become branches/leaves.
 *
 * Rendering: nodes are absolutely-positioned HTML divs for crisp text +
 * hover states; edges are a single SVG overlay with bezier paths. Pan/zoom
 * applies a CSS transform (Ctrl/⌘ + wheel to zoom, pointer drag to pan).
 *
 * Export: a separate self-contained SVG is constructed on demand (rect +
 * text nodes — no HTML foreignObject) so PNG/PDF rasterise reliably and
 * the downloaded file opens cleanly in any viewer.
 */

export type MindmapDirection = "TB" | "LR";

// ── Parser ────────────────────────────────────────────────────────────────
interface MindmapNode {
  id: string;
  text: string;
  depth: number;
  children: MindmapNode[];
}

let _idCounter = 0;
function mkId(): string {
  _idCounter++;
  return `mn_${_idCounter}`;
}

function parseMarkdownToTree(src: string): MindmapNode | null {
  const lines = src.split("\n");
  const superRoot: MindmapNode = {
    id: mkId(),
    text: "Mindmap",
    depth: -1,
    children: [],
  };
  const stack: MindmapNode[] = [superRoot];

  const headingDepth = (hashCount: number) => hashCount * 10;
  const bulletDepth = (indent: number) => 100 + Math.floor(indent / 2) * 10;

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const h = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (h) {
      const depth = headingDepth(h[1].length);
      const text = stripInline(h[2]);
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      const node: MindmapNode = { id: mkId(), text, depth, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    const b = raw.match(/^(\s*)([-*+])\s+(.+?)\s*$/);
    if (b) {
      const depth = bulletDepth(b[1].length);
      const text = stripInline(b[3]);
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      const node: MindmapNode = { id: mkId(), text, depth, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    const text = stripInline(raw.trim());
    if (!text) continue;
    const top = stack[stack.length - 1];
    const depth = Math.max(top.depth + 1, 200);
    top.children.push({ id: mkId(), text, depth, children: [] });
  }

  if (superRoot.children.length === 0) return null;
  if (superRoot.children.length === 1) {
    const only = superRoot.children[0];
    return { ...only, depth: 0 };
  }
  return { ...superRoot, depth: 0 };
}

function stripInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

// ── Layout constants ──────────────────────────────────────────────────────
const NODE_H = 44;
const NODE_MIN_W = 120;
const NODE_MAX_W = 220;
const CHAR_W = 7.5;

// Horizontal tree (LR)
const LR_DEPTH_GAP = 96;   // gap between depth levels horizontally
const LR_SIBLING_GAP = 14; // gap between siblings vertically

// Vertical tree (TB)
const TB_DEPTH_GAP = 60;   // gap between depth levels vertically
const TB_SIBLING_GAP = 28; // gap between siblings horizontally

const CHEVRON_SIZE = 22;
const CHEVRON_GAP = 6;

// x and y represent the CENTER of each node (both axes) for layout math.
// Rendering subtracts width/2 and height/2 to place the actual box.
interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  isLeaf: boolean;
}

function nodeWidth(text: string): number {
  const est = text.length * CHAR_W + 32;
  return Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, est));
}

// Size the subtree consumes along the main sibling axis:
//   - LR: vertical height (siblings stack vertically)
//   - TB: horizontal width  (siblings stack horizontally)
function subtreeSize(
  node: MindmapNode,
  expanded: Set<string>,
  direction: MindmapDirection
): number {
  const self =
    direction === "TB" ? nodeWidth(node.text) : NODE_H;
  if (!expanded.has(node.id) || node.children.length === 0) {
    return self;
  }
  const gap = direction === "TB" ? TB_SIBLING_GAP : LR_SIBLING_GAP;
  let total = 0;
  for (const c of node.children) total += subtreeSize(c, expanded, direction);
  total += (node.children.length - 1) * gap;
  return Math.max(total, self);
}

function layoutTree(
  root: MindmapNode,
  expanded: Set<string>,
  direction: MindmapDirection
): {
  positioned: PositionedNode[];
  edges: Array<[PositionedNode, PositionedNode]>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
} {
  const positioned: PositionedNode[] = [];
  const edges: Array<[PositionedNode, PositionedNode]> = [];

  const walk = (node: MindmapNode, x: number, y: number): PositionedNode => {
    const width = nodeWidth(node.text);
    const pn: PositionedNode = {
      node,
      x,
      y,
      width,
      isLeaf: node.children.length === 0,
    };
    positioned.push(pn);

    if (expanded.has(node.id) && node.children.length > 0) {
      const total = subtreeSize(node, expanded, direction);

      if (direction === "TB") {
        // Siblings stack horizontally → center them around parent's x
        let cursor = x - total / 2;
        const childY = y + NODE_H / 2 + TB_DEPTH_GAP + NODE_H / 2;
        for (const c of node.children) {
          const cSize = subtreeSize(c, expanded, direction);
          const childX = cursor + cSize / 2;
          const childPn = walk(c, childX, childY);
          edges.push([pn, childPn]);
          cursor += cSize + TB_SIBLING_GAP;
        }
      } else {
        // LR: siblings stack vertically → center them around parent's y
        let cursor = y - total / 2;
        const childX = x + width / 2 + LR_DEPTH_GAP + nodeWidth(node.children[0].text) / 2;
        for (const c of node.children) {
          const cSize = subtreeSize(c, expanded, direction);
          const childY = cursor + cSize / 2;
          const childPn = walk(c, childX, childY);
          edges.push([pn, childPn]);
          cursor += cSize + LR_SIBLING_GAP;
        }
      }
    }
    return pn;
  };

  walk(root, 0, 0);

  // Compute bounding box
  const lefts = positioned.map((p) => p.x - p.width / 2);
  const rights = positioned.map((p) => p.x + p.width / 2);
  const tops = positioned.map((p) => p.y - NODE_H / 2);
  const bottoms = positioned.map((p) => p.y + NODE_H / 2);

  return {
    positioned,
    edges,
    bounds: {
      minX: Math.min(...lefts) - 40,
      maxX: Math.max(...rights) + 40,
      minY: Math.min(...tops) - 40,
      maxY: Math.max(...bottoms) + 40,
    },
  };
}

// ── Edge path ─────────────────────────────────────────────────────────────
function edgePath(
  p: PositionedNode,
  c: PositionedNode,
  direction: MindmapDirection
): string {
  if (direction === "TB") {
    // parent bottom-center → child top-center
    const x1 = p.x;
    const y1 = p.y + NODE_H / 2;
    const x2 = c.x;
    const y2 = c.y - NODE_H / 2;
    const dy = Math.abs(y2 - y1);
    const cy1 = y1 + dy * 0.55;
    const cy2 = y2 - dy * 0.55;
    return `M ${x1} ${y1} C ${x1} ${cy1} ${x2} ${cy2} ${x2} ${y2}`;
  }
  // LR: parent right-center → child left-center
  const x1 = p.x + p.width / 2;
  const y1 = p.y;
  const x2 = c.x - c.width / 2;
  const y2 = c.y;
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + dx * 0.6;
  const cx2 = x2 - dx * 0.6;
  return `M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`;
}

// ── Utility ───────────────────────────────────────────────────────────────
function safeFilename(title: string): string {
  return (
    (title || "mindmap")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .replace(/\s+/g, "-")
      .trim()
      .toLowerCase() || "mindmap"
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

function defaultExpanded(root: MindmapNode): Set<string> {
  const set = new Set<string>();
  set.add(root.id);
  for (const c of root.children) set.add(c.id);
  return set;
}

function collectIds(node: MindmapNode, out: Set<string>) {
  out.add(node.id);
  for (const c of node.children) collectIds(c, out);
}

// Build a standalone SVG of the mindmap (rect + text nodes) that opens
// cleanly in any viewer and rasterises reliably for PNG/PDF export.
function buildExportSvg(
  root: MindmapNode,
  expanded: Set<string>,
  direction: MindmapDirection
): { svg: string; width: number; height: number } {
  const { positioned, edges, bounds } = layoutTree(root, expanded, direction);
  const pad = 20;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const ox = -bounds.minX + pad;
  const oy = -bounds.minY + pad;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const pathEls = edges
    .map(([p, c]) => {
      const shifted = (pn: PositionedNode) => ({
        ...pn,
        x: pn.x + ox,
        y: pn.y + oy,
      });
      const d = edgePath(shifted(p), shifted(c), direction);
      return `<path d="${d}" fill="none" stroke="#A5A0D8" stroke-width="1.5" />`;
    })
    .join("");

  const nodeEls = positioned
    .map((pn) => {
      const left = pn.x + ox - pn.width / 2;
      const top = pn.y + oy - NODE_H / 2;
      const fill = pn.node.id === root.id ? "#C7C0EC" : "#E4E1F8";
      return `
        <g>
          <rect x="${left}" y="${top}" width="${pn.width}" height="${NODE_H}" rx="12" ry="12" fill="${fill}" />
          <text x="${left + pn.width / 2}" y="${top + NODE_H / 2 + 4}"
                text-anchor="middle"
                font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                font-size="13" font-weight="500" fill="#1A1A1A">
            ${escape(pn.node.text)}
          </text>
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#FFFFFF" />
      ${pathEls}
      ${nodeEls}
    </svg>
  `.trim();
  return { svg, width, height };
}

// ── Component ─────────────────────────────────────────────────────────────
interface Props {
  source: string;
  /** Viewport height. Defaults to 480. */
  height?: number;
  /** Subtitle under the title. */
  subtitle?: string;
  /** Initial layout direction. Defaults to "TB" (vertical tree). */
  defaultDirection?: MindmapDirection;
}

function MindmapRendererImpl({
  source,
  height = 480,
  subtitle = "Based on this answer",
  defaultDirection = "TB",
}: Props) {
  const root = useMemo(() => parseMarkdownToTree(source), [source]);

  const [direction, setDirection] = useState<MindmapDirection>(defaultDirection);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    root ? defaultExpanded(root) : new Set()
  );

  // Reset expansion when the source changes (new mindmap incoming)
  useEffect(() => {
    if (root) setExpanded(defaultExpanded(root));
  }, [root]);

  const { positioned, edges, bounds } = useMemo(() => {
    if (!root)
      return {
        positioned: [] as PositionedNode[],
        edges: [] as Array<[PositionedNode, PositionedNode]>,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      };
    return layoutTree(root, expanded, direction);
  }, [root, expanded, direction]);

  // ── Pan / zoom ─────────────────────────────────────────────────────────
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w <= 0 || h <= 0) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const pad = 40;
    const scale = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h, 1);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const x = vw / 2 - cx * scale;
    const y = vh / 2 - cy * scale;
    setTransform({ x, y, scale });
  }, [bounds]);

  // Re-fit whenever the tree identity OR direction changes
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, direction]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((t) => {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.max(0.2, Math.min(3, t.scale * factor));
      const dx = (cx - t.x) * (nextScale / t.scale - 1);
      const dy = (cy - t.y) * (nextScale / t.scale - 1);
      return { x: t.x - dx, y: t.y - dy, scale: nextScale };
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-mindmap-interactive]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
    },
    [transform]
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    setTransform((t) => ({ ...t, x: d.tx + dx, y: d.ty + dy }));
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.2, Math.min(3, t.scale * factor)),
    }));
  }, []);

  // ── Expand / collapse ──────────────────────────────────────────────────
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!root) return;
    const all = new Set<string>();
    collectIds(root, all);
    setExpanded(all);
  }, [root]);
  const collapseAll = useCallback(() => {
    if (!root) return;
    setExpanded(new Set([root.id]));
  }, [root]);

  const toggleDirection = useCallback(() => {
    setDirection((d) => (d === "TB" ? "LR" : "TB"));
  }, []);

  // ── Exports ────────────────────────────────────────────────────────────
  const title = root?.text ?? "Mindmap";

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

  const downloadSVG = useCallback(async () => {
    if (!root) throw new Error("Empty mindmap");
    const { svg } = buildExportSvg(root, expanded, direction);
    downloadBlob(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      `${safeFilename(title)}-${timestampSlug()}.svg`
    );
  }, [root, expanded, direction, title]);

  const buildPngBlob = useCallback(async (): Promise<{
    blob: Blob;
    width: number;
    height: number;
  }> => {
    if (!root) throw new Error("Empty mindmap");
    const { svg, width, height } = buildExportSvg(root, expanded, direction);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const svgEl = doc.documentElement as unknown as SVGElement;
    svgEl.setAttribute("width", String(width));
    svgEl.setAttribute("height", String(height));
    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    holder.appendChild(svgEl as unknown as Node);
    document.body.appendChild(holder);
    try {
      const blob = await svgToPngBlob(svgEl);
      return { blob, width, height };
    } finally {
      holder.remove();
    }
  }, [root, expanded, direction]);

  const downloadPNG = useCallback(async () => {
    const { blob } = await buildPngBlob();
    downloadBlob(blob, `${safeFilename(title)}-${timestampSlug()}.png`);
  }, [buildPngBlob, title]);

  const downloadPDF = useCallback(async () => {
    const { jsPDF } = await import("jspdf");
    const { blob, width, height } = await buildPngBlob();
    const dataUrl = await blobToDataUrl(blob);
    const doc = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: width >= height ? "landscape" : "portrait",
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
      (height / width) * targetW
    );
    doc.addImage(dataUrl, "PNG", margin, margin + 36, targetW, targetH);
    doc.save(`${safeFilename(title)}-${timestampSlug()}.pdf`);
  }, [buildPngBlob, title]);

  const copyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(source);
    toast.success("Mindmap markdown copied");
  }, [source]);

  if (!root) {
    return (
      <div className="my-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-3 text-xs text-destructive flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Mindmap is empty</div>
          <div className="text-destructive/80 mt-0.5">
            Expected at least one heading or bullet in the mindmap source.
          </div>
        </div>
      </div>
    );
  }

  const contentW = bounds.maxX - bounds.minX + 40;
  const contentH = bounds.maxY - bounds.minY + 40;
  const ox = -bounds.minX + 20;
  const oy = -bounds.minY + 20;

  return (
    <div
      data-visual-kind="mindmap"
      data-visual-title={title}
      data-visual-direction={direction}
      className="group relative my-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm overflow-hidden"
    >
      <VisualToolbar
        label="Download mindmap"
        groups={[
          {
            label: "Mindmap",
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
                icon: <FileText className="h-3.5 w-3.5" />,
                onSelect: () => runExport(downloadSVG, "SVG"),
              },
            ],
          },
          {
            items: [
              {
                label: "Copy markdown",
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: copyMarkdown,
              },
            ],
          },
        ]}
      />

      {/* Header */}
      <div className="mb-2 px-1 pr-10 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-foreground leading-tight truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11.5px] text-muted-foreground mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleDirection}
          title={
            direction === "TB"
              ? "Switch to horizontal tree"
              : "Switch to vertical tree"
          }
          aria-label="Toggle layout direction"
          className={cn(
            "shrink-0 inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/80 hover:bg-muted",
            "px-1.5 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          )}
        >
          <LayoutGrid className="h-3 w-3" />
          {direction === "TB" ? "Vertical" : "Horizontal"}
        </button>
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          height,
          touchAction: "pan-x pan-y",
          cursor: dragRef.current ? "grabbing" : "grab",
        }}
        className="relative w-full rounded-lg bg-white dark:bg-[#1E1C1A] border border-border/40 overflow-hidden"
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transformOrigin: "0 0",
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            willChange: "transform",
          }}
        >
          <svg
            width={contentW}
            height={contentH}
            style={{
              position: "absolute",
              left: bounds.minX - 20,
              top: bounds.minY - 20,
              pointerEvents: "none",
            }}
          >
            <g transform={`translate(${ox},${oy})`}>
              {edges.map(([p, c], i) => (
                <path
                  key={i}
                  d={edgePath(p, c, direction)}
                  fill="none"
                  stroke="#A5A0D8"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          </svg>

          {positioned.map((pn) => {
            const isRoot = pn.node.id === root.id;
            const hasChildren = pn.node.children.length > 0;
            const isExpanded = expanded.has(pn.node.id);
            const left = pn.x - pn.width / 2;
            const top = pn.y - NODE_H / 2;

            // Chevron placement differs per direction:
            //   TB (vertical): chevron sits BELOW non-root nodes, ABOVE root
            //   LR (horizontal): chevron sits to the RIGHT, root has it LEFT
            let chevronStyle: React.CSSProperties | null = null;
            let chevronIcon: React.ReactNode = null;
            if (hasChildren) {
              if (direction === "TB") {
                if (isRoot) {
                  chevronStyle = {
                    position: "absolute",
                    left: (pn.width - CHEVRON_SIZE) / 2,
                    top: -CHEVRON_SIZE - CHEVRON_GAP,
                    width: CHEVRON_SIZE,
                    height: CHEVRON_SIZE,
                  };
                  chevronIcon = isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  );
                } else {
                  chevronStyle = {
                    position: "absolute",
                    left: (pn.width - CHEVRON_SIZE) / 2,
                    top: NODE_H + CHEVRON_GAP,
                    width: CHEVRON_SIZE,
                    height: CHEVRON_SIZE,
                  };
                  chevronIcon = isExpanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  );
                }
              } else {
                // LR
                if (isRoot) {
                  chevronStyle = {
                    position: "absolute",
                    left: -CHEVRON_SIZE - CHEVRON_GAP,
                    top: (NODE_H - CHEVRON_SIZE) / 2,
                    width: CHEVRON_SIZE,
                    height: CHEVRON_SIZE,
                  };
                  chevronIcon = isExpanded ? (
                    <ChevronLeft className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  );
                } else {
                  chevronStyle = {
                    position: "absolute",
                    left: pn.width + CHEVRON_GAP,
                    top: (NODE_H - CHEVRON_SIZE) / 2,
                    width: CHEVRON_SIZE,
                    height: CHEVRON_SIZE,
                  };
                  chevronIcon = isExpanded ? (
                    <ChevronLeft className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  );
                }
              }
            }

            return (
              <div
                key={pn.node.id}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: pn.width,
                  height: NODE_H,
                }}
              >
                <div
                  className={cn(
                    "h-full w-full rounded-[12px] flex items-center justify-center px-4 text-[13px] leading-tight",
                    "font-medium text-[#1A1A1A] dark:text-[#1A1A1A]",
                    "select-none shadow-[0_1px_2px_rgba(80,70,140,0.08)]",
                    "transition-colors",
                    isRoot
                      ? "bg-[#C7C0EC] hover:bg-[#BEB6E8]"
                      : "bg-[#E4E1F8] hover:bg-[#D6D2F0]"
                  )}
                  title={pn.node.text}
                >
                  <span className="truncate">{pn.node.text}</span>
                </div>

                {chevronStyle && chevronIcon && (
                  <button
                    type="button"
                    data-mindmap-interactive
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(pn.node.id);
                    }}
                    aria-label={isExpanded ? "Collapse branch" : "Expand branch"}
                    style={chevronStyle}
                    className={cn(
                      "rounded-full flex items-center justify-center",
                      "bg-[#E4E1F8] hover:bg-[#D0CBEE] border border-[#BEB6E8]",
                      "text-[#3D3865] transition-colors shadow-sm"
                    )}
                  >
                    {chevronIcon}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Floating zoom / fit controls */}
        <div
          className={cn(
            "absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-background/95 backdrop-blur px-0.5 py-0.5 shadow-sm",
            "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          )}
        >
          <button
            type="button"
            onClick={() => zoomBy(0.85)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <MinusSquare className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fit}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.15)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <PlusSquare className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Expand / collapse all */}
        <div
          className={cn(
            "absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-md border border-border/70 bg-background/95 backdrop-blur px-1.5 py-1 shadow-sm text-[11px] text-muted-foreground",
            "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          )}
        >
          <button
            type="button"
            onClick={expandAll}
            className="px-1 hover:text-foreground transition-colors"
            title="Expand all branches"
          >
            Expand all
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="px-1 hover:text-foreground transition-colors"
            title="Collapse all branches"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="mt-1 px-1 text-[10.5px] text-muted-foreground/80 flex items-center gap-2">
        <span>Drag to pan</span>
        <span className="opacity-50">·</span>
        <span>Ctrl / ⌘ + scroll to zoom</span>
        <span className="opacity-50">·</span>
        <span>Click chevrons to expand/collapse</span>
      </div>
    </div>
  );
}

export const MindmapRenderer = memo(MindmapRendererImpl);
export default MindmapRenderer;

export function parseMindmapSource(raw: string): string | null {
  const src = raw.trim();
  if (!src) return null;
  if (!/^(#|[-*+])/m.test(src)) return null;
  return src;
}

// Exported so the full-conversation PDF exporter can render each mindmap
// from its source string directly (no DOM dependency). Defaults to the
// vertical ("TB") layout so reports mirror what the user sees by default.
export function buildMindmapExportSvg(
  source: string,
  direction: MindmapDirection = "TB"
): { svg: string; width: number; height: number; title: string } | null {
  const root = parseMarkdownToTree(source);
  if (!root) return null;
  const expanded = new Set<string>();
  collectIds(root, expanded);
  const { svg, width, height } = buildExportSvg(root, expanded, direction);
  return { svg, width, height, title: root.text };
}
