"use client";
import { useCallback, useReducer, useRef } from "react";

export type HistoryEntry = {
  description: string;
  redo: () => Promise<void> | void;
  undo: () => Promise<void> | void;
};

export function useFormHistory(limit = 50) {
  const stackRef = useRef<HistoryEntry[]>([]);
  const indexRef = useRef(-1);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const push = useCallback(
    (entry: HistoryEntry) => {
      let next = [...stackRef.current.slice(0, indexRef.current + 1), entry];
      if (next.length > limit) next = next.slice(next.length - limit);
      stackRef.current = next;
      indexRef.current = next.length - 1;
      force();
    },
    [limit],
  );

  const undo = useCallback(async () => {
    if (indexRef.current < 0) return;
    const entry = stackRef.current[indexRef.current];
    indexRef.current -= 1;
    force();
    await entry.undo();
  }, []);

  const redo = useCallback(async () => {
    if (indexRef.current >= stackRef.current.length - 1) return;
    const entry = stackRef.current[indexRef.current + 1];
    indexRef.current += 1;
    force();
    await entry.redo();
  }, []);

  const reset = useCallback(() => {
    stackRef.current = [];
    indexRef.current = -1;
    force();
  }, []);

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: indexRef.current >= 0,
    canRedo: indexRef.current < stackRef.current.length - 1,
  };
}
