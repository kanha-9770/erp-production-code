"use client";

/**
 * Module workflow — at-a-glance "how it works" diagram.
 *
 * A single "!" button that opens a lightweight, self-explanatory flow chart of
 * whatever module the user is on: every stage a record moves through, plain
 * one-line explanations, and small tags showing where the system emails people,
 * notifies the team, or auto-creates the next document.
 *
 * It's fully data-driven — pass a `ModuleFlow` (see lib/module-flows) and it
 * renders. Designed so a brand-new user instantly understands the process.
 *
 * Two trigger styles:
 *   - "inline"   → a compact icon button for page toolbars/headers.
 *   - "floating" → a fixed help beacon, used by the global injector so the
 *                  diagram is reachable on every module without editing pages.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, Mail, Bell, Sparkles, ArrowDown, HelpCircle } from "lucide-react";

export type FlowTag = "email" | "auto" | "notify";

export interface FlowStep {
  /** Short stage label (usually matches the status the user sets). */
  label: string;
  /** One-line plain explanation of what this stage means. */
  detail: string;
  /** Candidate/recipient email sent at this step, if any. */
  email?: string;
  /** Automation side-effect at this step, if any (what gets auto-created). */
  auto?: string;
  /** Whether the team/approver is notified in-app at this step. */
  notify?: boolean;
  /** Accent color (hex) for the node dot + icon. */
  tint: string;
  icon: React.ComponentType<{ className?: string }>;
  kind?: "start" | "step" | "end";
}

export interface FlowSideStep {
  label: string;
  note: string;
  tint: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ModuleFlow {
  /** Dialog title, e.g. "How leave requests work". */
  title: string;
  /** One-line summary under the title. */
  description: string;
  /** The happy-path stages, top to bottom. */
  steps: FlowStep[];
  /** Transitions that can happen from many stages (rejected / cancelled / …). */
  sideSteps?: FlowSideStep[];
  /** Heading for the side-steps block. Defaults to "Can happen at any stage". */
  sideTitle?: string;
  /** Closing tip line. */
  tip?: string;
}

function Tag({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (className ?? "")
      }
    >
      <Icon className="h-3 w-3 shrink-0" />
      {children}
    </span>
  );
}

const EMAIL_CLS =
  "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
const AUTO_CLS =
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
const NOTIFY_CLS =
  "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";

function FlowDiagram({ flow }: { flow: ModuleFlow }) {
  // Only show the legend chips that actually appear in this flow.
  const hasEmail = flow.steps.some((s) => s.email);
  const hasAuto = flow.steps.some((s) => s.auto);
  const hasNotify = flow.steps.some((s) => s.notify);

  return (
    <>
      {(hasEmail || hasAuto || hasNotify) && (
        <div className="flex flex-wrap gap-2 pb-1">
          {hasEmail && (
            <Tag icon={Mail} className={EMAIL_CLS}>
              Email sent
            </Tag>
          )}
          {hasAuto && (
            <Tag icon={Sparkles} className={AUTO_CLS}>
              Auto-created
            </Tag>
          )}
          {hasNotify && (
            <Tag icon={Bell} className={NOTIFY_CLS}>
              Team notified
            </Tag>
          )}
        </div>
      )}

      <ol className="relative">
        {flow.steps.map((s, i) => {
          const Icon = s.icon;
          const isLast = i === flow.steps.length - 1;
          return (
            <li key={s.label} className="relative pl-9 pb-3 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[13px] top-7 bottom-0 w-px bg-border"
                />
              )}
              <span
                className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm"
                style={{ backgroundColor: s.tint }}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <div className="rounded-lg border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.label}</span>
                  {s.kind === "start" && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      start
                    </span>
                  )}
                  {s.kind === "end" && (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-600">
                      done
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>
                {(s.email || s.auto || s.notify) && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {s.email && (
                      <Tag icon={Mail} className={EMAIL_CLS}>
                        {s.email}
                      </Tag>
                    )}
                    {s.auto && (
                      <Tag icon={Sparkles} className={AUTO_CLS}>
                        {s.auto}
                      </Tag>
                    )}
                    {s.notify && (
                      <Tag icon={Bell} className={NOTIFY_CLS}>
                        Team notified
                      </Tag>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {flow.sideSteps && flow.sideSteps.length > 0 && (
        <div className="mt-2 border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <ArrowDown className="h-3.5 w-3.5" />
            {flow.sideTitle ?? "Can happen at any stage"}
          </div>
          <div className="grid gap-1.5">
            {flow.sideSteps.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5"
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0"
                    style={{ backgroundColor: s.tint }}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground text-right">
                    {s.note}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {flow.tip && (
        <p className="text-[11px] text-muted-foreground mt-1">{flow.tip}</p>
      )}
    </>
  );
}

export function ModuleFlowInfo({
  flow,
  trigger = "inline",
  className,
}: {
  flow: ModuleFlow;
  trigger?: "inline" | "floating";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "floating" ? (
          <Button
            variant="secondary"
            size="sm"
            className={
              "fixed z-30 right-4 bottom-20 md:bottom-6 h-10 rounded-full shadow-lg border pl-3 pr-4 gap-1.5 " +
              "bg-background/95 backdrop-blur hover:bg-accent " +
              (className ?? "")
            }
            aria-label="How this module works"
          >
            <HelpCircle className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium hidden sm:inline">
              How it works
            </span>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className={"h-8 w-8 shrink-0 " + (className ?? "")}
            aria-label="How this module works"
            title="How it works"
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            {flow.title}
          </DialogTitle>
          <DialogDescription>{flow.description}</DialogDescription>
        </DialogHeader>
        <FlowDiagram flow={flow} />
      </DialogContent>
    </Dialog>
  );
}
