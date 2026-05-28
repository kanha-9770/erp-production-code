"use client";

/**
 * "By Role" view — the new role-centric workflow.
 *
 * Layout:
 *   ≥ lg: split layout, role list on the left (sticky), detail on the right.
 *   < lg: stacked. When a role is picked, a Sheet slides in from the right
 *         with the role's detail; on smaller widths the Sheet covers the
 *         whole screen for max usability.
 *
 * Data:
 *   One GET on /api/roles/with-counts gives us every role + its user count +
 *   permission count in a single batched query. No N+1.
 *
 * The "Permissions" tab inside each role's detail receives a slot prop so
 * the host page (page.tsx) can hand in whatever permissions UI it wants —
 * we don't lock the new view to the existing matrices.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Globe, X, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RoleList, type RoleListItem } from "./role-list";
import { RoleDetailTabs } from "./role-detail-tabs";

interface ApiResponse {
  success: boolean;
  roles: RoleListItem[];
  error?: string;
}

interface ByRoleViewProps {
  /**
   * Render-prop for the "Permissions" tab content. The host page passes in
   * its existing matrices (forms / sections / fields × roles). The selected
   * role's id is provided so the matrices can optionally focus on a single
   * column when they're enhanced for this view.
   */
  renderPermissionsSlot: (role: RoleListItem) => React.ReactNode;
}

export function ByRoleView({ renderPermissionsSlot }: ByRoleViewProps) {
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/roles/with-counts", {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (cancelled) return;
        if (j.success) {
          setRoles(j.roles);
          // Default selection: first role, but ONLY on desktop. On mobile
          // we don't auto-open the detail sheet — the user picks first.
          if (j.roles.length > 0 && typeof window !== "undefined" && window.innerWidth >= 1024) {
            setSelectedId(j.roles[0].id);
          }
        } else {
          setError(j.error ?? "Failed to load roles");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load roles");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    // On smaller widths, open the role detail in a sheet.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  };

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-0 lg:gap-0 lg:h-[calc(100vh-9rem)] rounded-lg border bg-card overflow-hidden">
        {/* Left rail */}
        <div className="lg:w-[280px] xl:w-[320px] lg:shrink-0 lg:border-r flex flex-col min-h-0 max-h-[60vh] lg:max-h-none">
          <RoleList
            roles={roles}
            loading={loading}
            selectedRoleId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Right pane — desktop only */}
        <div className="hidden lg:flex flex-1 min-w-0 min-h-0">
          {selectedRole ? (
            <RoleDetailTabs
              role={selectedRole}
              permissionsSlot={renderPermissionsSlot(selectedRole)}
            />
          ) : (
            <EmptyDetailState />
          )}
        </div>
      </div>

      {/* Mobile: detail in a Sheet */}
      <Sheet
        open={mobileDetailOpen}
        onOpenChange={setMobileDetailOpen}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 flex flex-col gap-0 lg:hidden"
        >
          <SheetHeader className="px-4 py-3 border-b flex flex-row items-center justify-between gap-2 sticky top-0 bg-background z-10">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 h-7 px-2 -ml-2"
              onClick={() => setMobileDetailOpen(false)}
            >
              <ChevronLeft className="h-4 w-4" />
              Roles
            </Button>
            <SheetTitle className="text-sm font-medium">
              Role detail
            </SheetTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setMobileDetailOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selectedRole ? (
              <RoleDetailTabs
                role={selectedRole}
                permissionsSlot={renderPermissionsSlot(selectedRole)}
              />
            ) : (
              <EmptyDetailState />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function EmptyDetailState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div>
        <Globe className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm font-medium">Pick a role from the list</p>
        <p className="text-xs text-muted-foreground mt-1">
          You'll see its permissions and the users assigned to it.
        </p>
      </div>
    </div>
  );
}
