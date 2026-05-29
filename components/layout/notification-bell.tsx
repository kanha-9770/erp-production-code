"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellRing, Check, CheckCheck } from "lucide-react"
import { requestPushPermission } from "@/components/push/push-init"
import {
  ensureAlertSoundUnlock,
  playNotificationSound,
} from "@/lib/notifications/alert-sound"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationsReadMutation,
  type NotificationItem,
} from "@/lib/api/notifications"

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const diffSec = Math.max(1, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

function absoluteTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString()
}

interface NotificationBellProps {
  collapsed?: boolean
}

export function NotificationBell({ collapsed = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  // The notification currently expanded in the detail dialog. `null` = closed.
  const [activeNotification, setActiveNotification] =
    useState<NotificationItem | null>(null)

  // Poll the cheap count endpoint every 60s for the badge; only fetch the
  // full list when the popover is opened so the closed state is essentially
  // free.
  const { data: countResp } = useGetUnreadCountQuery(undefined, {
    pollingInterval: 60000,
    refetchOnMountOrArgChange: true,
  })
  const { data: listResp, isFetching } = useGetNotificationsQuery(
    { limit: 20 },
    { skip: !open, refetchOnMountOrArgChange: true }
  )
  const [markRead] = useMarkNotificationsReadMutation()

  const unread = countResp?.data?.count || 0
  const items = useMemo(() => listResp?.data || [], [listResp])

  // Ring the in-app chime whenever the unread count goes up. First render is
  // a no-op (just record the baseline) so we don't ding on initial page load
  // when previously-unread rows simply rehydrate from the server. Browser
  // autoplay policies require a prior user gesture — `ensureAlertSoundUnlock`
  // arms a one-time listener that resumes the AudioContext on first input.
  const prevUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    ensureAlertSoundUnlock()
  }, [])
  useEffect(() => {
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unread
      return
    }
    if (unread > prevUnreadRef.current) {
      playNotificationSound()
    }
    prevUnreadRef.current = unread
  }, [unread])

  // Click on an item — open the detail dialog and mark the row read in the
  // background. We don't navigate anywhere: notifications are read-only
  // messages from admin-defined workflow rules.
  const handleItemClick = async (n: NotificationItem) => {
    setActiveNotification(n)
    setOpen(false)
    if (!n.isRead) {
      try {
        await markRead({ id: n.id }).unwrap()
      } catch {
        /* swallow — bell is non-critical */
      }
    }
  }

  const handleMarkAll = async () => {
    if (unread === 0) return
    try {
      await markRead({ all: true }).unwrap()
    } catch {
      /* swallow */
    }
  }

  const detailFields = activeNotification?.data?.fields || []

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            className={cn(
              "relative inline-flex items-center justify-center rounded-md text-black hover:text-white hover:bg-black transition-colors",
              collapsed ? "h-8 w-8" : "h-7 w-7"
            )}
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] leading-[16px] font-semibold text-center ring-2 ring-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-80 p-0 max-h-[480px] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-2">
              <PushEnableButton />
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={unread === 0}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mark all as read"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {isFetching && items.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                You're all caught up.
              </div>
            ) : (
              items.map((n) => {
                const fieldCount = n.data?.fields?.length || 0
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/40 transition-colors cursor-pointer",
                      !n.isRead && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-xs leading-snug",
                              n.isRead
                                ? "text-muted-foreground"
                                : "text-foreground font-medium"
                            )}
                          >
                            {n.title}
                          </p>
                          {n.isRead && (
                            <Check className="w-3 h-3 text-muted-foreground/60 shrink-0 mt-0.5" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-line line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {n.moduleName && (
                            <span className="text-[10px] text-muted-foreground/80">
                              {n.moduleName}
                            </span>
                          )}
                          {fieldCount > 0 && (
                            <span className="text-[10px] text-primary/80">
                              {fieldCount} field{fieldCount === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Detail dialog — shows the full notification message and the
          admin-selected fields with their current values. Read-only;
          there's no navigation to record pages. */}
      <Dialog
        open={!!activeNotification}
        onOpenChange={(open) => {
          if (!open) setActiveNotification(null)
        }}
      >
        <DialogContent className="max-w-lg p-0 gap-0">
          {activeNotification && (
            <>
              <DialogHeader className="px-6 pt-6 pb-3 border-b">
                <DialogTitle className="text-base leading-snug pr-6">
                  {activeNotification.title}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                  {activeNotification.moduleName && (
                    <span className="font-medium text-foreground/70">
                      {activeNotification.moduleName}
                    </span>
                  )}
                  {activeNotification.ruleName && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span>via {activeNotification.ruleName}</span>
                    </>
                  )}
                  <span className="text-muted-foreground/50">•</span>
                  <span>{absoluteTime(activeNotification.createdAt)}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {activeNotification.body && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Message
                    </p>
                    <p className="text-sm whitespace-pre-line leading-relaxed">
                      {activeNotification.body}
                    </p>
                  </div>
                )}

                {detailFields.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Field updates ({detailFields.length})
                    </p>
                    <div className="rounded border overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/60 border-b">
                            <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 w-12">
                              #
                            </th>
                            <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 w-[160px]">
                              Field
                            </th>
                            <th className="text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailFields.map((f, idx) => (
                            <tr
                              key={`${f.apiName}-${idx}`}
                              className={cn(
                                "border-b last:border-b-0 hover:bg-muted/40 transition-colors",
                                idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                              )}
                            >
                              <td className="px-3 py-2 align-top text-[10px] text-muted-foreground tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <p className="font-medium text-foreground leading-tight">
                                  {f.label}
                                </p>
                                {f.apiName && f.apiName !== f.label && (
                                  <p className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                                    {f.apiName}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top text-foreground/90 break-words">
                                {f.value ? (
                                  <span className="whitespace-pre-line">{f.value}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">empty</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!activeNotification.body && detailFields.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No additional details.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default NotificationBell

/**
 * Small button inside the bell popover header that lets the user enable
 * native push notifications. State is read straight from `Notification`
 * (no React store needed) because the browser is the source of truth and
 * permission only changes via user action.
 */
function PushEnableButton() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported")
      return
    }
    setPermission(Notification.permission)
  }, [])

  if (permission === "unsupported") return null
  if (permission === "granted") {
    // Subtle "all set" indicator — clicking would be a no-op so we render
    // a static icon instead of a button to avoid drawing attention to it.
    return (
      <span
        className="text-[11px] text-emerald-600 inline-flex items-center gap-1"
        title="Push notifications enabled"
      >
        <BellRing className="w-3 h-3" />
        On
      </span>
    )
  }
  if (permission === "denied") {
    // Can't re-prompt — the user has to go into site settings. Linkify-ish
    // hint via the title attribute so we don't add another modal.
    return (
      <span
        className="text-[11px] text-muted-foreground inline-flex items-center gap-1"
        title="Push blocked. Enable it in your browser's site settings."
      >
        <BellRing className="w-3 h-3" />
        Blocked
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const next = await requestPushPermission()
          setPermission(next)
        } finally {
          setBusy(false)
        }
      }}
      className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50"
      title="Get OS-level notifications even when this site is closed"
    >
      <BellRing className="w-3 h-3" />
      {busy ? "Enabling…" : "Enable push"}
    </button>
  )
}
