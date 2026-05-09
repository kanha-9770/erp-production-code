"use client";

import { useLocalStorage } from "./use-local-storage";

/**
 * Per-table column preferences: visibility map, sort direction, sort column.
 * Reordering is intentionally not part of v1 — adds drag complexity for a
 * payoff users rarely ask for. Width is opt-in; if a column has no entry
 * the table falls back to its default width.
 */

export interface TablePrefs {
  hidden: Record<string, true>; // column id → hidden
  width: Record<string, number>; // column id → px
  sort: { column: string; direction: "asc" | "desc" } | null;
  density: "compact" | "comfortable";
}

const DEFAULT: TablePrefs = {
  hidden: {},
  width: {},
  sort: null,
  density: "comfortable",
};

export function useTablePrefs(tableId: string) {
  const [prefs, setPrefs, reset] = useLocalStorage<TablePrefs>(
    `rebm:table:${tableId}`,
    DEFAULT,
  );

  return {
    prefs,
    isHidden: (colId: string) => !!prefs.hidden[colId],
    toggleHidden: (colId: string) =>
      setPrefs((p) => {
        const next = { ...p.hidden };
        if (next[colId]) delete next[colId];
        else next[colId] = true;
        return { ...p, hidden: next };
      }),
    setWidth: (colId: string, px: number) =>
      setPrefs((p) => ({ ...p, width: { ...p.width, [colId]: px } })),
    setSort: (column: string, direction: "asc" | "desc" | null) =>
      setPrefs((p) => ({
        ...p,
        sort: direction == null ? null : { column, direction },
      })),
    setDensity: (density: TablePrefs["density"]) =>
      setPrefs((p) => ({ ...p, density })),
    reset,
  };
}
