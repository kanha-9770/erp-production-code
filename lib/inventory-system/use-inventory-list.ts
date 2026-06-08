"use client";

/**
 * useInventoryList — server-paginated, debounced, cancellable list fetching for
 * one inventory submodule.
 *
 * Advanced fetching concerns handled here:
 *   • Server-side pagination/filter/sort — only the current page is fetched.
 *   • Debounce — the search term is debounced (~280ms) so typing fires one
 *     request, not one per keystroke. Page/filter/sort changes fetch immediately.
 *   • Cancellation — each fetch carries an AbortController; a newer fetch aborts
 *     the in-flight one, and a request-id guard drops any out-of-order resolve.
 *   • Keep-previous-data — `rows` are retained while a new page loads so the
 *     table never flashes empty during the round-trip (only `loading` toggles).
 *   • Revalidation — re-fetches whenever the provider's `revalidateToken` bumps
 *     (i.e. after any create/update/delete), keeping the page consistent without
 *     a global in-memory cache.
 */

import { useEffect, useRef, useState } from "react";
import { useInventory } from "./store";
import { inventoryService, type InventoryListQuery } from "./service";
import type { InventoryItem } from "./types";

export interface InventoryListState {
  rows: InventoryItem[];
  total: number;
  lowCount: number;
  outCount: number;
  loading: boolean;
  error: string | null;
  /**
   * The exact query the currently-displayed data was fetched with (search
   * already debounced). Use this — not the live query — for "select all" /
   * export so the selected set always matches the visible total. Null until the
   * first page resolves.
   */
  resolvedQuery: InventoryListQuery | null;
}

const INITIAL: InventoryListState = {
  rows: [],
  total: 0,
  lowCount: 0,
  outCount: 0,
  loading: true,
  error: null,
  resolvedQuery: null,
};

export function useInventoryList(query: InventoryListQuery): InventoryListState {
  const { revalidateToken } = useInventory();
  const [state, setState] = useState<InventoryListState>(INITIAL);

  // Debounce the search term only; everything else refetches immediately.
  const [debouncedSearch, setDebouncedSearch] = useState(query.search ?? "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(query.search ?? ""), 280);
    return () => clearTimeout(t);
  }, [query.search]);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const prevSubmoduleRef = useRef(query.submodule);

  // Stable dep for the masters object (new-but-equal object shouldn't refetch).
  const mastersKey = JSON.stringify(query.masters ?? {});

  useEffect(() => {
    const id = ++reqIdRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // keep-previous-data WITHIN a submodule, but never show another submodule's
    // rows: clear them on a submodule switch so the skeleton shows instead.
    const submoduleChanged = prevSubmoduleRef.current !== query.submodule;
    prevSubmoduleRef.current = query.submodule;
    setState((s) =>
      submoduleChanged ? { ...INITIAL } : { ...s, loading: true, error: null },
    );

    // The exact query this fetch ran with (debounced search baked in) — echoed
    // back as resolvedQuery so the consumer's select-all/export match the view.
    const fetchedQuery: InventoryListQuery = { ...query, search: debouncedSearch };

    inventoryService
      .listItems(fetchedQuery, ac.signal)
      .then((res) => {
        if (reqIdRef.current !== id) return; // a newer request superseded us
        setState({
          rows: res.rows,
          total: res.total,
          lowCount: res.lowCount,
          outCount: res.outCount,
          loading: false,
          error: null,
          resolvedQuery: fetchedQuery,
        });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted || reqIdRef.current !== id) return; // cancelled/stale
        setState((s) => ({
          ...s,
          loading: false,
          error: (err as Error)?.message ?? "Failed to load",
        }));
      });

    return () => ac.abort();
    // query is reconstructed from these primitive deps; mastersKey/debouncedSearch cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.submodule,
    query.page,
    query.pageSize,
    query.status,
    query.sortKey,
    query.sortDir,
    debouncedSearch,
    mastersKey,
    revalidateToken,
  ]);

  return state;
}
