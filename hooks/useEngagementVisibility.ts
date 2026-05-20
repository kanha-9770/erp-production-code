"use client";

/**
 * useEngagementVisibility — engagement submissions are visible to every
 * authenticated employee in the organisation (cross-team), so the hook now
 * returns a permissive `seeAll = true` immediately. Kept as a hook (rather
 * than a constant) so call sites and the `loading` contract don't have to
 * change.
 *
 * Reviewing / awarding points is still Admin / HR-only — that's gated by
 * the dashboard's `canReview` flag and the awards API, not here.
 *
 * IMPORTANT: returns a *stable* singleton reference. The five engagement
 * pages put `visibility` in a useEffect / useCallback dependency array — a
 * fresh object literal every render would trigger an infinite re-fetch
 * loop in loadKaizens / loadSuggestions / etc.
 */

export interface EngagementVisibility {
  seeAll: boolean;
  myTeamId: string | null;
  myEmployeeId: string | null;
  loading: boolean;
}

const SINGLETON: EngagementVisibility = Object.freeze({
  seeAll: true,
  myTeamId: null,
  myEmployeeId: null,
  loading: false,
});

export function useEngagementVisibility(): EngagementVisibility {
  return SINGLETON;
}

// Stable no-op predicate — same identity on every call, so call sites that
// embed it in `useMemo`/`useCallback` deps don't churn.
const ALLOW_ALL = () => true;

/**
 * Filter predicate for engagement records. With org-wide visibility this is
 * a no-op — kept exported so existing call sites (`rows.filter(allow)`)
 * compile without change.
 */
export function makeEngagementFilter<T extends { employeeId: string }>(
  _vis: EngagementVisibility,
  _employeeIdToTeamId: Map<string, string | null>,
): (record: T) => boolean {
  void _vis;
  void _employeeIdToTeamId;
  return ALLOW_ALL;
}
