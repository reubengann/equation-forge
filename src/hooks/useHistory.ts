import { useState, useCallback } from "react";
import type { MJ } from "../ExpressionTree";

export type History = { past: MJ[]; present: MJ | null; future: MJ[] };

export function useHistory(initialPresent: MJ | null = null) {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const undo = useCallback((applyPresent: (json: MJ) => void) => {
    let previous: MJ | null = null;
    setHistory((h) => {
      if (h.past.length === 0) return h;
      previous = h.past[h.past.length - 1];
      const future = h.present != null ? [h.present, ...h.future] : h.future;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future,
      };
    });
    if (previous != null) {
      applyPresent(previous);
    }
  }, []);

  const redo = useCallback((applyPresent: (json: MJ) => void) => {
    let head: MJ | null = null;
    setHistory((h) => {
      if (h.future.length === 0) return h;
      [head] = h.future;
      const tail = h.future.slice(1);
      const past = h.present != null ? [...h.past, h.present] : h.past;
      return { past, present: head, future: tail };
    });
    if (head != null) {
      applyPresent(head);
    }
  }, []);

  const commit = useCallback((next: MJ) => {
    setHistory((h) => {
      const past = h.present != null ? [...h.past, h.present] : [...h.past];
      return { past, present: next, future: [] };
    });
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return {
    history,
    undo,
    redo,
    commit,
    canUndo,
    canRedo,
  };
}
