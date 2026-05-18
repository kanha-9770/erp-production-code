"use client";

import { useLocalStorage } from "./use-local-storage";

/**
 * Per-table column preferences: visibility map, sort direction, sort column.
 * Reordering is intentionally not part of v1 — adds drag complexity for a
 * payoff users rarely ask for. Width is opt-in; if a column has no entry
 * the table falls back to its default width.
 *
 * Visibility is tri-state to keep `defaultHidden` columns toggleable:
 *   - `true`      → user explicitly hid this column
 *   - `false`     → user explicitly showed this column (overrides defaultHidden)
 *   - missing key → use the column's defaultHidden flag (defaults to visible)
 *
 * Without the tri-state, a `defaultHidden` column would always be hidden
 * after a single click (since the toggle could only add/remove the entry,
 * never flip to an explicit-visible state).
 */

export interface TablePrefs {
  hidden: Record<string, boolean>; // column id → explicit visibility override
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
    isHidden: (colId: string) => prefs.hidden[colId] === true,
    /**
     * Flip a column's effective visibility. Caller passes the column's
     * `defaultHidden` flag so we know what the "absent key" case means and
     * can pick the right explicit value to flip TO. Without this, clicking
     * a `defaultHidden` column would just bounce between "default hidden"
     * and "explicit hidden" — visually a no-op.
     */
    toggleHidden: (colId: string, defaultHidden = false) =>
      setPrefs((p) => {
        const next = { ...p.hidden };
        const explicit = next[colId];
        // Effective current state: explicit override wins, else fall back
        // to the column's defaultHidden flag.
        const currentlyHidden = explicit === undefined ? defaultHidden : explicit;
        // Flip to the opposite, stored EXPLICITLY so a `defaultHidden`
        // column can be revealed (and vice-versa).
        next[colId] = !currentlyHidden;
        return { ...p, hidden: next };
      }),
    /**
     * Set a column's visibility explicitly. Useful for bulk show/hide
     * actions where the caller doesn't want toggle semantics.
     */
    setColumnVisible: (colId: string, visible: boolean) =>
      setPrefs((p) => ({
        ...p,
        hidden: { ...p.hidden, [colId]: !visible },
      })),
    /**
     * Clear a column's explicit override so it falls back to its
     * defaultHidden setting. Use this for "Reset" flows on a single column.
     */
    clearColumnOverride: (colId: string) =>
      setPrefs((p) => {
        const next = { ...p.hidden };
        delete next[colId];
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
