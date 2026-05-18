"use client";

/**
 * useEngagementVisibility — pulls the caller's engagement-team scope so the
 * 5 engagement pages (Kaizen, Suggestion, Problem Registration,
 * Self-Initiative, Self-Target) can decide what records to show:
 *
 *   - seeAll:        true → render every record (Admin / HR).
 *   - myTeamId:      caller's team id, or null when unassigned.
 *   - myEmployeeId:  caller's own employee id (fallback bucket for
 *                    unassigned users who should still see their own work).
 *
 * Wraps a single GET on /api/engagement-teams/me. Centralised here so all
 * five pages share the same filtering contract.
 */

import { useEffect, useState } from "react";

export interface EngagementVisibility {
  seeAll: boolean;
  myTeamId: string | null;
  myEmployeeId: string | null;
  loading: boolean;
}

const INITIAL: EngagementVisibility = {
  seeAll: false,
  myTeamId: null,
  myEmployeeId: null,
  loading: true,
};

export function useEngagementVisibility(): EngagementVisibility {
  const [state, setState] = useState<EngagementVisibility>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engagement-teams/me", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          setState({
            seeAll: !!json.seeAll,
            myTeamId: json.myTeamId ?? null,
            myEmployeeId: json.myEmployeeId ?? null,
            loading: false,
          });
          return;
        }
      } catch {
        // Soft-fail: stay non-admin, no team, so the page falls back to
        // "show only my own records" which is the safest default.
      }
      if (!cancelled) {
        setState({ seeAll: false, myTeamId: null, myEmployeeId: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Filter predicate for engagement records. Use after both employees and
 * visibility have loaded.
 *
 *   - seeAll → keep everything.
 *   - has team → keep records whose author is on the same team.
 *   - no team → keep only the caller's own records.
 */
export function makeEngagementFilter<T extends { employeeId: string }>(
  vis: EngagementVisibility,
  employeeIdToTeamId: Map<string, string | null>,
): (record: T) => boolean {
  if (vis.seeAll) return () => true;
  if (vis.myTeamId) {
    return (r) => employeeIdToTeamId.get(r.employeeId) === vis.myTeamId;
  }
  // Unassigned → see only own
  return (r) => r.employeeId === vis.myEmployeeId;
}
