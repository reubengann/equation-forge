import { useState, useCallback } from "react";

export type History<T> = { past: T[]; present: T | null; future: T[] };

export function useHistory<T>(initialPresent: T | null = null) {
  const [history, setHistory] = useState<History<T>>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const undo = useCallback((applyPresent: (next: T) => void) => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const future =
      history.present != null ? [history.present, ...history.future] : history.future;
    setHistory({
      past: history.past.slice(0, -1),
      present: previous,
      future,
    });
    applyPresent(previous);
  }, [history]);

  const redo = useCallback((applyPresent: (next: T) => void) => {
    if (history.future.length === 0) return;
    const [head] = history.future;
    const tail = history.future.slice(1);
    const past = history.present != null ? [...history.past, history.present] : history.past;
    setHistory({ past, present: head, future: tail });
    applyPresent(head);
  }, [history]);

  const commit = useCallback((next: T) => {
    const past =
      history.present != null ? [...history.past, history.present] : [...history.past];
    setHistory({ past, present: next, future: [] });
  }, [history]);

  const replace = useCallback((next: History<T>) => {
    setHistory(next);
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return {
    history,
    undo,
    redo,
    commit,
    replace,
    canUndo,
    canRedo,
  };
}
