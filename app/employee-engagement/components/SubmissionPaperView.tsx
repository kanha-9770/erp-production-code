"use client";

/**
 * Paper-form view of an engagement submission. Mirrors the printed
 * Nessco forms (Kaizen Idea Sheet, Suggestion Form, Problem Registration,
 * Self Initiative Registration, Self Target) so admin/HR see exactly
 * what the employee filled, in the layout they expect.
 *
 * Built as a single CSS grid so cells line up cleanly across rows
 * without nested wrappers. All borders use `border-collapse`-style
 * negative-margin tricks; instead each cell paints its own top + right
 * border and the wrapper paints its left + bottom — every interior
 * line shows up exactly once.
 */

import React from "react";
import { getStatusMeta } from "@/lib/constants/engagement";

export type PaperModule = "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target";

export type SubmissionPaperData = {
  module: PaperModule;
  displayId: string;
  title: string;
  status: string;
  category: string;
  createdAt: string;            // ISO
  endDate?: string | null;
  employee: {
    employeeId: string;
    name: string;
    department: string;
    teamName?: string | null;
  };
  description?: string;
  currentState?: string;
  proposedState?: string;
  benefits?: string;
  suggestion?: string;
  feedback?: string | null;
  severity?: string;
  proposedSolution?: string;
  startDate?: string;
  targetDate?: string;
  progress?: number;
  votes?: number;
  beforeMedia?: string | null;
  afterMedia?: string | null;
  referenceImage?: string | null;
  points?: number | null;
  bonusPoints?: number | null;
  bonusReason?: string | null;
  remark?: string | null;
  isBestKaizen?: boolean | null;
  reviewStatus?: string | null;
  reviewerName?: string | null;
};

const MODULE_TITLE: Record<PaperModule, string> = {
  Kaizen: "KAIZEN IDEA SHEET",
  Suggestion: "SUGGESTION FORM",
  Problem: "PROBLEM REGISTRATION",
  Initiative: "SELF INITIATIVE REGISTRATION",
  Target: "SELF TARGET",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function isRenderable(src: string | null | undefined): src is string {
  if (!src) return false;
  return src.startsWith("data:image/") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/");
}

/**
 * Download the rendered paper form as a clean, full-page document.
 *
 * Opens a new window containing ONLY the form (not the surrounding
 * dashboard), copies the current page's stylesheets so Tailwind classes
 * resolve, fits it to a landscape A4 page, and triggers the browser's
 * print dialog — where "Save as PDF" produces a proper single-form PDF.
 * Dependency-free; works for every module because it captures whatever
 * `node` was rendered.
 */
export function downloadPaperView(node: HTMLElement | null, filename: string) {
  if (!node) return;
  const win = window.open("", "_blank", "width=1280,height=900");
  if (!win) {
    alert("Couldn't open the download window. Please allow pop-ups for this site and try again.");
    return;
  }
  const headStyles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((el) => el.outerHTML)
    .join("\n");

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${filename}</title>
${headStyles}
<style>
  @page { size: A4 landscape; margin: 8mm; }
  html, body { background: #fff; margin: 0; padding: 0; }
  /* fit-shell is scaled to exactly one page in JS; fit-inner holds the form. */
  .fit-shell { overflow: hidden; }
  .fit-inner { width: 1040px; }     /* render at a fixed width, then scale */
  img { max-width: 100%; }
  /* Don't let a single cell break across pages once it fits. */
  .fit-inner > div { page-break-inside: avoid; break-inside: avoid; }
</style>
</head>
<body>
  <div class="fit-shell"><div class="fit-inner">${node.outerHTML}</div></div>
</body>
</html>`);
  win.document.close();

  // After content + images load, measure the form and scale it down so
  // the whole thing fits one landscape A4 page (no second page).
  const fitAndPrint = () => {
    try {
      const inner = win.document.querySelector(".fit-inner") as HTMLElement | null;
      const shell = win.document.querySelector(".fit-shell") as HTMLElement | null;
      if (inner && shell) {
        // Printable area for A4 landscape at 96dpi with 8mm margins:
        // (297-16)mm × (210-16)mm ≈ 1062px × 733px. Keep a small safety pad.
        const PAGE_W = 1050;
        const PAGE_H = 720;
        const w = inner.scrollWidth || 1040;
        const h = inner.scrollHeight || 1;
        const scale = Math.min(1, PAGE_W / w, PAGE_H / h);
        if (scale < 1) {
          inner.style.transformOrigin = "top left";
          inner.style.transform = `scale(${scale})`;
          // Shrink the shell to the scaled box so the page sees one page.
          shell.style.width = `${Math.ceil(w * scale)}px`;
          shell.style.height = `${Math.ceil(h * scale)}px`;
        }
      }
      win.focus();
      win.print();
    } catch {
      /* user can still print manually */
    }
  };
  // Wait for images (data URLs are instant; linked CSS needs a beat).
  win.onload = () => setTimeout(fitAndPrint, 400);
  setTimeout(fitAndPrint, 1000);
}

// Static col-span class table. Tailwind's JIT compiler needs the full
// class name in the source — `col-span-${n}` would be purged. Twelve
// values cover the 12-col paper grid exhaustively.
const COL_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};

// Each cell paints its own top + right border. The outer wrapper paints
// the left + bottom of the whole table. Result: every interior line is
// drawn by exactly one element, regardless of row count — no overlap,
// no negative margins.
function Cell({
  label,
  value,
  colSpan = 1,
  align = "left",
  bold = false,
  large = false,
  bg = "white",
  className = "",
}: {
  label?: string;
  value?: React.ReactNode;
  colSpan?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  large?: boolean;
  bg?: "white" | "slate";
  className?: string;
}) {
  const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  const bgClass = bg === "slate" ? "bg-slate-50" : "bg-white";
  const spanClass = COL_SPAN[Math.max(1, Math.min(12, colSpan))];
  return (
    <div
      className={`${spanClass} border-t border-r border-slate-400 px-3 py-2 text-sm ${bgClass} ${alignClass} ${className}`}
    >
      {label && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
          {label}
        </div>
      )}
      <div
        className={`whitespace-pre-wrap break-words leading-relaxed ${bold ? "font-bold" : ""} ${large ? "text-base" : ""}`}
      >
        {value ?? <span className="text-slate-400 italic">—</span>}
      </div>
    </div>
  );
}

function MediaCell({
  label,
  value,
  colSpan = 6,
}: {
  label: string;
  value: string | null | undefined;
  colSpan?: number;
}) {
  const spanClass = COL_SPAN[Math.max(1, Math.min(12, colSpan))];
  return (
    <div className={`${spanClass} border-t border-r border-slate-400 px-3 py-2 bg-white`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
        {label}
      </div>
      {isRenderable(value) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={label}
          className="max-h-56 w-full rounded border border-slate-300 object-contain bg-white"
        />
      ) : value ? (
        <div className="text-xs font-mono text-slate-700 break-all">{value}</div>
      ) : (
        <div className="text-xs text-slate-400 italic py-6 text-center">Not provided</div>
      )}
    </div>
  );
}

// ── Per-module bodies. Each returns the rows that fit between the
// employee strip and the footer. Outer wrapper renders the 12-col grid
// and the surrounding borders.
function KaizenRows({ data }: { data: SubmissionPaperData }) {
  return (
    <>
      <Cell label="Theme of Improvement" value={data.category} colSpan={6} />
      <Cell label="Machine / Asset / Station" value="—" colSpan={3} />
      <Cell label="Kaizen Start Date" value={fmtDate(data.createdAt)} colSpan={3} />

      <Cell label="Problem / Present Method" value={data.description} colSpan={6} />
      <Cell label="Kaizen End Date" value={fmtDate(data.endDate)} colSpan={3} />
      <Cell label="Horizontal Implement" value="—" colSpan={3} />

      <MediaCell label="Before Kaizen (Photo / Sketch / Video)" value={data.beforeMedia} colSpan={6} />
      <MediaCell label="After Kaizen (Photo / Sketch / Video)" value={data.afterMedia} colSpan={6} />

      <Cell label="Why Why Analysis" value={data.currentState} colSpan={6} />
      <Cell label="Results (In Figures)" value={data.proposedState} colSpan={6} />

      <Cell label="Benefits" value={data.benefits} colSpan={12} />
    </>
  );
}

function SuggestionRows({ data }: { data: SubmissionPaperData }) {
  return (
    <>
      <Cell label="Present System / Method / Process" value="—" colSpan={6} />
      <MediaCell label="Photo / Sketch" value={data.referenceImage} colSpan={6} />

      <Cell label="Your Suggestion" value={data.suggestion} colSpan={6} />
      <Cell label="Category" value={data.category} colSpan={6} />

      <Cell label="Suggestion Implementer Department" value={data.employee.department} colSpan={4} />
      <Cell label="Suggestion Implement By" value="—" colSpan={4} />
      <Cell label="Factory" value="—" colSpan={4} />

      <Cell label="Tangible / Intangible Benefits" value={data.feedback ?? "—"} colSpan={12} />
    </>
  );
}

function ProblemRows({ data }: { data: SubmissionPaperData }) {
  return (
    <>
      <Cell label="What Exactly Happened in Present" value={data.description} colSpan={6} />
      <MediaCell label="Problem Photo / Video" value={data.referenceImage} colSpan={6} />

      <Cell label="Probable Solution" value={data.proposedSolution} colSpan={6} />
      <Cell label="Where the Problem Identified" value={data.category} colSpan={6} />

      <Cell label="Severity" value={data.severity} colSpan={3} align="center" />
      <Cell label="Expected Resolution Date" value={fmtDate(data.endDate)} colSpan={3} align="center" />
      <Cell label="Status" value={getStatusMeta(data.status).label} colSpan={6} />
    </>
  );
}

function InitiativeRows({ data }: { data: SubmissionPaperData }) {
  return (
    <>
      <Cell label="Self Initiative Category" value={data.category} colSpan={12} />
      <Cell label="Initiative Details" value={data.description} colSpan={12} />

      <Cell label="Initiative Timeline From" value={fmtDate(data.startDate)} colSpan={4} />
      <Cell label="Initiative Timeline To" value={fmtDate(data.endDate)} colSpan={4} />
      <Cell label="Status" value={getStatusMeta(data.status).label} colSpan={4} />

      {data.referenceImage && (
        <MediaCell label="Reference Media" value={data.referenceImage} colSpan={12} />
      )}
    </>
  );
}

function TargetRows({ data }: { data: SubmissionPaperData }) {
  return (
    <>
      <Cell label="Monthly Target" value={data.description} colSpan={12} />

      <Cell label="Target Date" value={fmtDate(data.targetDate)} colSpan={4} align="center" />
      <Cell label="End Date" value={fmtDate(data.endDate)} colSpan={4} align="center" />
      <Cell
        label="Progress"
        value={typeof data.progress === "number" ? `${data.progress}%` : "—"}
        colSpan={4}
        align="center"
      />

      {data.referenceImage && (
        <MediaCell label="Reference Media" value={data.referenceImage} colSpan={12} />
      )}
    </>
  );
}

export default function SubmissionPaperView({ data }: { data: SubmissionPaperData }) {
  let Rows: React.ComponentType<{ data: SubmissionPaperData }>;
  switch (data.module) {
    case "Kaizen": Rows = KaizenRows; break;
    case "Suggestion": Rows = SuggestionRows; break;
    case "Problem": Rows = ProblemRows; break;
    case "Initiative": Rows = InitiativeRows; break;
    case "Target": Rows = TargetRows; break;
  }

  const sm = getStatusMeta(data.status);

  return (
    <div className="bg-white text-slate-900">
      <div className="border-l border-b border-slate-400 grid grid-cols-12 w-full text-slate-900 shadow-sm">
        {/* ── Header row (Unique ID / title / date) ── */}
        <Cell value="UNIQUE ID" colSpan={2} bg="slate" bold align="center" />
        <Cell value={MODULE_TITLE[data.module]} colSpan={7} bg="slate" bold large align="center" />
        <Cell
          label={
            data.module === "Problem"
              ? "Problem Identified Date"
              : data.module === "Initiative"
                ? "Initiative Start Date"
                : data.module === "Target"
                  ? "Target Month"
                  : "Date"
          }
          value={
            data.module === "Target"
              ? (() => {
                  const d = new Date(data.createdAt);
                  return isNaN(d.getTime()) ? "—" : MONTHS[d.getMonth()].toUpperCase();
                })()
              : data.module === "Initiative"
                ? fmtDate(data.startDate ?? data.createdAt)
                : fmtDate(data.createdAt)
          }
          colSpan={3}
          bg="slate"
        />

        {/* ── ID + Title row ── */}
        <Cell value={data.displayId} colSpan={2} bold align="center" className="font-mono" />
        <Cell value={data.title} colSpan={10} bold className="uppercase" />

        {/* ── Employee strip ── */}
        <Cell label="Employee Name" value={data.employee.name} colSpan={4} />
        <Cell label="Employee ID" value={data.employee.employeeId} colSpan={3} />
        <Cell
          label={data.module === "Suggestion" ? "HOD Name" : "Top Team Name"}
          value={data.employee.teamName || "—"}
          colSpan={2}
        />
        <Cell label="Employee Department" value={data.employee.department} colSpan={3} />

        {/* ── Module-specific body ── */}
        <Rows data={data} />

        {/* ── Admin / HR decision — prominent so it carries into the PDF ── */}
        {(() => {
          const map: Record<string, { label: string; cls: string }> = {
            approved: { label: "APPROVED", cls: "text-emerald-700" },
            rejected: { label: "NOT APPROVED", cls: "text-rose-700" },
            "needs-info": { label: "NEEDS INFO", cls: "text-blue-700" },
            pending: { label: "PENDING REVIEW", cls: "text-amber-700" },
          };
          const m = data.reviewStatus ? map[data.reviewStatus] : undefined;
          return (
            <Cell
              label="Admin / HR Decision"
              value={
                m ? (
                  <span className={`font-bold ${m.cls}`}>{m.label}</span>
                ) : (
                  <span className="text-slate-400 italic">Awaiting review</span>
                )
              }
              colSpan={12}
              bg="slate"
            />
          );
        })()}

        {/* ── Footer strip: status / points / bonus / reviewer ── */}
        <Cell
          label="Status"
          value={<span className="font-semibold">{sm.label}</span>}
          colSpan={3}
        />
        <Cell
          label="Points Allotted"
          value={typeof data.points === "number" ? String(data.points) : "—"}
          colSpan={3}
          align="center"
        />
        <Cell
          label="Bonus Points"
          value={
            typeof data.bonusPoints === "number" && data.bonusPoints > 0
              ? `+${data.bonusPoints}`
              : "—"
          }
          colSpan={3}
          align="center"
        />
        <Cell label="Reviewed By" value={data.reviewerName || "—"} colSpan={3} />

        {data.module === "Kaizen" && (
          <Cell
            label="Best Kaizen"
            value={
              data.isBestKaizen ? (
                <span className="font-bold text-amber-700">★ YES</span>
              ) : (
                "No"
              )
            }
            colSpan={12}
            align="center"
            bg={data.isBestKaizen ? "slate" : "white"}
          />
        )}
        {/* Admin / HR remark — always shown as a labeled section, even
            when empty, so the form makes clear where the reviewer's
            written remark goes. */}
        <Cell
          label="Remark (by Admin / HR)"
          value={data.remark || <span className="text-slate-400 italic">No remark recorded</span>}
          colSpan={12}
        />
        {data.bonusReason && (
          <Cell label="Bonus Reason" value={data.bonusReason} colSpan={12} />
        )}
      </div>
    </div>
  );
}
