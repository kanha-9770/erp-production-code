"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./use-local-storage";

/**
 * Saved views per list page. A view is { name, filters } — column visibility
 * and sort live in TablePrefs. We deliberately keep the two separate so the
 * user can switch view (= filters) without losing the columns they want
 * showing.
 */

export interface SavedView<F extends object> {
  id: string;
  name: string;
  filters: F;
  pinned?: boolean;
  createdAt: number;
}

interface ViewsState<F extends object> {
  views: SavedView<F>[];
  activeId: string | null;
}

function makeId() {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSavedViews<F extends object>(scope: string, defaults: SavedView<F>[] = []) {
  const initial: ViewsState<F> = {
    views: defaults,
    activeId: defaults[0]?.id ?? null,
  };
  const [state, setState] = useLocalStorage<ViewsState<F>>(
    `rebm:views:${scope}`,
    initial,
  );

  const active = state.views.find((v) => v.id === state.activeId) ?? null;

  const select = useCallback(
    (id: string | null) => setState((s) => ({ ...s, activeId: id })),
    [setState],
  );

  const save = useCallback(
    (name: string, filters: F) => {
      const view: SavedView<F> = { id: makeId(), name, filters, createdAt: Date.now() };
      setState((s) => ({ views: [...s.views, view], activeId: view.id }));
      return view;
    },
    [setState],
  );

  const update = useCallback(
    (id: string, patch: Partial<Pick<SavedView<F>, "name" | "filters" | "pinned">>) =>
      setState((s) => ({
        ...s,
        views: s.views.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      })),
    [setState],
  );

  const remove = useCallback(
    (id: string) =>
      setState((s) => ({
        views: s.views.filter((v) => v.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      })),
    [setState],
  );

  return { views: state.views, activeId: state.activeId, active, select, save, update, remove };
}
