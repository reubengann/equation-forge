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
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      const future = h.present != null ? [h.present, ...h.future] : h.future;
      const nextHistory = {
        past: h.past.slice(0, -1),
        present: previous,
        future,
      };
      applyPresent(previous);
      return nextHistory;
    });
  }, []);

  const redo = useCallback((applyPresent: (json: MJ) => void) => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [head, ...tail] = h.future;
      const past = h.present != null ? [...h.past, h.present] : h.past;
      const nextHistory = { past, present: head, future: tail };
      applyPresent(head);
      return nextHistory;
    });
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
