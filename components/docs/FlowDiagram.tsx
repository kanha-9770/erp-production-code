"use client"

import { useEffect, useRef, useState } from "react"
import type { Guide } from "@/lib/docs/guides"

/**
 * Advanced animated flow diagram.
 *
 * Renders a 4-stage choreographed animation (Form → Workflow → Function →
 * Result) that adapts its visuals to the guide's configuration:
 *   - Action verb + colour come from guide.workflow.recordAction
 *   - Node labels come from guide.workflow.module, function slug, target module
 *   - Flow type (update-self vs. cross-module vs. delete) is inferred from
 *     the modules array + recordAction and changes the target-node rendering
 *
 * Animation strategy:
 *   - A single SMIL <animateMotion> drives the data packet along a 3-segment
 *     path. keyTimes + keyPoints create explicit "pause at each node" moments.
 *   - Node glows are SMIL <animate> on stroke-width + a separate ripple
 *     <circle> that expands and fades — timed to fire at the moment the
 *     packet arrives.
 *   - A JS tick loop updates the status banner text in sync with the 6s
 *     SMIL cycle.
 */

type FlowType = "update-self" | "cross-module" | "delete" | "move"

interface FlowInfo {
  source: string
  target: string
  action: string
  actionTone: "create" | "update" | "delete" | "trigger"
  flowType: FlowType
  functionName: string
  triggerLabel: string
  resultVerb: string
}

const TONE_COLORS: Record<
  FlowInfo["actionTone"],
  { stroke: string; fill: string; text: string; ring: string }
> = {
  create: {
    stroke: "stroke-emerald-500",
    fill: "fill-emerald-500/10",
    text: "fill-emerald-600 dark:fill-emerald-400",
    ring: "text-emerald-500",
  },
  update: {
    stroke: "stroke-sky-500",
    fill: "fill-sky-500/10",
    text: "fill-sky-600 dark:fill-sky-400",
    ring: "text-sky-500",
  },
  delete: {
    stroke: "stroke-rose-500",
    fill: "fill-rose-500/10",
    text: "fill-rose-600 dark:fill-rose-400",
    ring: "text-rose-500",
  },
  trigger: {
    stroke: "stroke-violet-500",
    fill: "fill-violet-500/10",
    text: "fill-violet-600 dark:fill-violet-400",
    ring: "text-violet-500",
  },
}

const STAGE_LABELS = [
  "📝 Record submitted",
  "⚡ Workflow rule matched",
  "ƒ Function executing",
  "✅ Result written",
]

const CYCLE_MS = 6000
const STAGE_STARTS_MS = [0, 1500, 3300, 5100]

function deriveFlow(guide: Guide): FlowInfo {
  const source = guide.workflow.module
  const target = guide.modules[guide.modules.length - 1] || source
  const action = guide.workflow.recordAction || "Field change"
  const isSelf = source === target

  // Tone: based on recordAction for colour theme.
  let actionTone: FlowInfo["actionTone"] = "update"
  if (guide.workflow.recordAction === "Create") actionTone = "create"
  else if (guide.workflow.recordAction === "Delete") actionTone = "delete"
  else if (guide.workflow.executeBasedOn === "record-field") actionTone = "trigger"

  // Flow type: heuristic from modules + slug.
  let flowType: FlowType = "update-self"
  const slug = guide.slug
  if (guide.workflow.recordAction === "Delete" || slug.includes("cascade") || slug.includes("delete")) {
    flowType = "delete"
  } else if (!isSelf && (slug.includes("move") || slug.includes("block") || slug.includes("duplicate") || slug.includes("personal"))) {
    flowType = "move"
  } else if (!isSelf) {
    flowType = "cross-module"
  }

  // Result verb shown under the 4th node.
  let resultVerb = "Update record"
  if (flowType === "cross-module") resultVerb = `Create in ${target}`
  else if (flowType === "move") resultVerb = `Move to ${target}`
  else if (flowType === "delete") resultVerb = "Delete record"
  else resultVerb = "Patch record"

  return {
    source,
    target,
    action,
    actionTone,
    flowType,
    functionName: guide.slug.replace(/-/g, "_"),
    triggerLabel: action,
    resultVerb,
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function FlowDiagram({ guide }: { guide: Guide }) {
  const flow = deriveFlow(guide)
  const tone = TONE_COLORS[flow.actionTone]
  const [stage, setStage] = useState(0)
  const startRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : Date.now())

  useEffect(() => {
    startRef.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = (performance.now() - startRef.current) % CYCLE_MS
      let s = 0
      for (let i = STAGE_STARTS_MS.length - 1; i >= 0; i--) {
        if (elapsed >= STAGE_STARTS_MS[i]) {
          s = i
          break
        }
      }
      setStage((prev) => (prev === s ? prev : s))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Node X centres — evenly spaced on a 800-wide viewBox.
  const NODES_X = [115, 305, 495, 685]
  const NODE_Y = 95
  const NODE_W = 130
  const NODE_H = 80
  const CY = NODE_Y + NODE_H / 2

  return (
    <div className="my-4 overflow-hidden rounded-lg border bg-gradient-to-br from-background via-muted/20 to-background p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${tone.ring}`} style={{ backgroundColor: "currentColor" }} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${tone.ring}`} style={{ backgroundColor: "currentColor" }} />
          </span>
          Live choreography
        </span>
        <span className="inline-flex items-center gap-2 normal-case tracking-normal">
          <span className="text-[10px] text-muted-foreground">Trigger:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
            {flow.triggerLabel}
          </code>
        </span>
      </div>

      {/* SVG */}
      <svg
        viewBox="0 0 800 220"
        className="w-full"
        style={{ maxHeight: 240 }}
        role="img"
        aria-label={`Flow for ${guide.title}`}
      >
        <defs>
          <linearGradient id="flow-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
          </linearGradient>

          <filter id="flow-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
          </marker>
        </defs>

        {/* Connecting paths */}
        {[0, 1, 2].map((i) => {
          const x1 = NODES_X[i] + NODE_W / 2
          const x2 = NODES_X[i + 1] - NODE_W / 2
          const d = `M ${x1},${CY} C ${x1 + 25},${CY - 12} ${x2 - 25},${CY + 12} ${x2},${CY}`
          return (
            <path
              key={i}
              d={d}
              stroke="url(#flow-gradient)"
              strokeWidth="2"
              fill="none"
              className={tone.ring}
              markerEnd="url(#flow-arrow)"
            />
          )
        })}

        {/* Ripple circles — expand + fade when the packet arrives at each node */}
        {NODES_X.map((cx, i) => {
          const r = rippleTiming(i)
          return (
            <circle
              key={`ripple-${i}`}
              cx={cx}
              cy={CY}
              r="0"
              fill="currentColor"
              opacity="0"
              className={tone.ring}
            >
              <animate
                attributeName="r"
                values={r.rValues}
                keyTimes={r.keyTimes}
                dur={`${CYCLE_MS}ms`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values={r.opValues}
                keyTimes={r.keyTimes}
                dur={`${CYCLE_MS}ms`}
                repeatCount="indefinite"
              />
            </circle>
          )
        })}

        {/* Nodes */}
        <FlowNode
          x={NODES_X[0] - NODE_W / 2}
          y={NODE_Y}
          w={NODE_W}
          h={NODE_H}
          active={stage === 0}
          label="Form submit"
          sub={flow.source}
          icon="📝"
          tone={tone}
          stageIndex={0}
        />
        <FlowNode
          x={NODES_X[1] - NODE_W / 2}
          y={NODE_Y}
          w={NODE_W}
          h={NODE_H}
          active={stage === 1}
          label="Workflow rule"
          sub={flow.triggerLabel}
          icon="⚡"
          tone={tone}
          stageIndex={1}
          accent
        />
        <FlowNode
          x={NODES_X[2] - NODE_W / 2}
          y={NODE_Y}
          w={NODE_W}
          h={NODE_H}
          active={stage === 2}
          label="Function"
          sub={flow.functionName}
          icon="ƒ"
          tone={tone}
          stageIndex={2}
          accent
        />
        <FlowNode
          x={NODES_X[3] - NODE_W / 2}
          y={NODE_Y}
          w={NODE_W}
          h={NODE_H}
          active={stage === 3}
          label={flow.resultVerb}
          sub={flow.target}
          icon={flow.flowType === "delete" ? "🗑️" : flow.flowType === "move" ? "↔️" : flow.flowType === "update-self" ? "✏️" : "🗂️"}
          tone={tone}
          stageIndex={3}
          end
        />

        {/* The travelling data packet */}
        <g>
          <g>
            <rect
              x="-26"
              y="-11"
              width="52"
              height="22"
              rx="4"
              className={`${tone.stroke} ${tone.fill}`}
              strokeWidth="1.5"
              filter="url(#flow-glow)"
            />
            <circle cx="-18" cy="0" r="2.5" className={tone.text} fill="currentColor" />
            <text
              x="-10"
              y="3.5"
              fontSize="10"
              className="fill-foreground"
              fontFamily="monospace"
              fontWeight="600"
            >
              record
            </text>
          </g>
          <animateMotion
            dur={`${CYCLE_MS}ms`}
            repeatCount="indefinite"
            keyTimes="0; 0.24; 0.3; 0.54; 0.6; 0.84; 1"
            keyPoints="0; 0.333; 0.333; 0.666; 0.666; 1; 1"
            calcMode="linear"
            path={`M ${NODES_X[0]},${CY} L ${NODES_X[1]},${CY} L ${NODES_X[2]},${CY} L ${NODES_X[3]},${CY}`}
          />
          <animate
            attributeName="opacity"
            values="0;1;1;1;1;1;0.6;0"
            keyTimes="0; 0.06; 0.24; 0.3; 0.54; 0.84; 0.92; 1"
            dur={`${CYCLE_MS}ms`}
            repeatCount="indefinite"
          />
        </g>
      </svg>

      {/* Status banner */}
      <div className="mt-3 overflow-hidden rounded-md border bg-background">
        <div className="flex">
          {STAGE_LABELS.map((label, i) => {
            const isActive = stage === i
            const isPast = stage > i
            return (
              <div
                key={i}
                className={`flex-1 border-r px-3 py-2 text-[11px] transition-all last:border-r-0 ${
                  isActive
                    ? "bg-muted/60 font-medium text-foreground"
                    : isPast
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60"
                }`}
              >
                <div className="flex items-center gap-1">
                  {isActive && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  )}
                  {label}
                </div>
              </div>
            )
          })}
        </div>
        {/* Progress bar under the banner */}
        <div className="relative h-1 bg-muted">
          <div
            className="absolute left-0 top-0 h-full bg-primary/80"
            style={{
              width: "25%",
              transform: `translateX(${stage * 100}%)`,
              transition: "transform 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Timing + values for the ripple on node `i`.
 *  SMIL requires: keyTimes starts at 0, ends at 1, same count as values. */
function rippleTiming(i: number): {
  keyTimes: string
  rValues: string
  opValues: string
} {
  // Clamp slightly away from 0 so the first stop (0) is distinct.
  const start = Math.max(0.002, STAGE_STARTS_MS[i] / CYCLE_MS)
  const peak = Math.min(0.995, start + 0.04)
  const fade = Math.min(0.998, start + 0.14)
  const keyTimes = `0; ${start.toFixed(3)}; ${peak.toFixed(3)}; ${fade.toFixed(3)}; 1`
  return {
    keyTimes,
    rValues: "0; 0; 60; 60; 0",
    opValues: "0; 0; 0.45; 0; 0",
  }
}

function FlowNode({
  x,
  y,
  w,
  h,
  label,
  sub,
  icon,
  tone,
  active,
  stageIndex,
  accent,
  end,
}: {
  x: number
  y: number
  w: number
  h: number
  label: string
  sub: string
  icon: string
  tone: { stroke: string; fill: string; text: string; ring: string }
  active: boolean
  stageIndex: number
  accent?: boolean
  end?: boolean
}) {
  const strokeClass = accent
    ? tone.stroke
    : end
    ? tone.stroke
    : "stroke-muted-foreground/40"
  const fillClass = accent || end ? tone.fill : "fill-background"
  const cx = x + w / 2
  const cy = y + h / 2

  // Truncate long subtitles.
  const shortSub = sub.length > 16 ? sub.slice(0, 14) + "…" : sub

  return (
    <g>
      {/* Shadow / outline that pulses when active */}
      <rect
        x={x - 2}
        y={y - 2}
        width={w + 4}
        height={h + 4}
        rx="12"
        className={active ? tone.stroke : "stroke-transparent"}
        strokeWidth={active ? 2 : 0}
        fill="none"
        opacity={active ? 0.6 : 0}
        style={{ transition: "opacity 0.3s" }}
      />
      {/* Main body */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        className={`${strokeClass} ${fillClass}`}
        strokeWidth="1.5"
      >
        <animate
          attributeName="stroke-width"
          values="1.5;1.5;2.75;1.5;1.5"
          keyTimes={nodeKeyTimes(stageIndex)}
          dur={`${CYCLE_MS}ms`}
          repeatCount="indefinite"
        />
      </rect>
      {/* Icon */}
      <text x={cx} y={y + 26} textAnchor="middle" fontSize="18">
        {icon}
      </text>
      {/* Label */}
      <text
        x={cx}
        y={y + 48}
        textAnchor="middle"
        fontSize="11"
        className="fill-foreground"
        fontWeight="600"
      >
        {label}
      </text>
      {/* Subtitle */}
      <text
        x={cx}
        y={y + 64}
        textAnchor="middle"
        fontSize="10"
        className="fill-muted-foreground"
        fontFamily="monospace"
      >
        {shortSub}
      </text>
    </g>
  )
}

/** Key times for node stroke pulse — widens when the packet arrives at this
 *  node, then settles. */
function nodeKeyTimes(i: number): string {
  const start = STAGE_STARTS_MS[i] / CYCLE_MS
  const pulseStart = Math.max(0, start - 0.01)
  const pulseMid = Math.min(1, start + 0.03)
  const pulseEnd = Math.min(1, start + 0.08)
  const clamp = (n: number) => Math.max(0, Math.min(1, n)).toFixed(3)
  if (i === 0) {
    return "0; 0.01; 0.03; 0.08; 1"
  }
  return `0; ${clamp(pulseStart)}; ${clamp(pulseMid)}; ${clamp(pulseEnd)}; 1`
}
