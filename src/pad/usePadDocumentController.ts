import { useCallback, useMemo } from "react";
import type { EquationRowState } from "../EquationRowState";
import { compileMathDocument } from "@equation-forge/core/compile";
import type { PadDefinitionSource } from "../substituteSuggestions";
import type { EquationCopySurroundMode } from "../copyLatex";
import {
  createEmptyPadEquation,
  duplicatePadEquation,
  normalizePadEquations,
  type PadEquation,
} from "./padDocument";

export type PadDocumentControllerOptions = {
  equations: PadEquation[];
  activeEquationId: string | null;
  copySurroundMode: EquationCopySurroundMode;
  onEquationsChange: (nextEquations: PadEquation[]) => void;
  onActiveEquationIdChange: (nextActiveEquationId: string | null) => void;
  onCopySurroundModeChange: (nextValue: EquationCopySurroundMode) => void;
};

export function buildPadDefinitionSources(equations: PadEquation[]): Map<string, PadDefinitionSource> {
  const sources = new Map<string, PadDefinitionSource>();
  equations.forEach((equation, index) => {
    if (equation.state.mode !== "display") return;
    try {
      sources.set(equation.id, {
        equationId: equation.id,
        label: `Equation ${index + 1}`,
        compiledDoc: compileMathDocument(equation.state.latex),
      });
    } catch {
      // Invalid stored/render state should not break the rest of the pad.
    }
  });
  return sources;
}

export function getSubstituteSuggestionSourcesForEquation(
  sourcesByEquationId: Map<string, PadDefinitionSource>,
  equationId: string,
): PadDefinitionSource[] {
  return [...sourcesByEquationId.values()].filter((source) => source.equationId !== equationId);
}

export function usePadDocumentController({
  equations,
  activeEquationId,
  copySurroundMode,
  onEquationsChange,
  onActiveEquationIdChange,
  onCopySurroundModeChange,
}: PadDocumentControllerOptions) {
  const compiledSourcesByEquationId = useMemo(() => buildPadDefinitionSources(equations), [equations]);

  const addEquation = useCallback((latex?: string) => {
    const equation = createEmptyPadEquation(latex);
    onEquationsChange([...equations, equation]);
    onActiveEquationIdChange(equation.id);
  }, [equations, onActiveEquationIdChange, onEquationsChange]);

  const removeEquation = useCallback(
    (id: string) => {
      const normalizedNext = normalizePadEquations(equations.filter((equation) => equation.id !== id));
      const nextActiveId =
        activeEquationId === id || !normalizedNext.some((equation) => equation.id === activeEquationId)
          ? (normalizedNext[0]?.id ?? null)
          : activeEquationId;
      onEquationsChange(normalizedNext);
      onActiveEquationIdChange(nextActiveId);
    },
    [activeEquationId, equations, onActiveEquationIdChange, onEquationsChange],
  );

  const moveEquation = useCallback(
    (id: string, offset: -1 | 1) => {
      const sourceIndex = equations.findIndex((equation) => equation.id === id);
      const destinationIndex = sourceIndex + offset;
      if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= equations.length) return;

      const next = [...equations];
      const [movedEquation] = next.splice(sourceIndex, 1);
      if (!movedEquation) return;
      next.splice(destinationIndex, 0, movedEquation);
      onEquationsChange(next);
    },
    [equations, onEquationsChange],
  );

  const duplicateEquationAfter = useCallback(
    (id: string) => {
      const sourceEquation = equations.find((equation) => equation.id === id);
      const sourceIndex = equations.findIndex((equation) => equation.id === id);
      if (!sourceEquation || sourceIndex < 0) return;

      const duplicatedEquation = duplicatePadEquation(sourceEquation);
      const next = [...equations];
      next.splice(sourceIndex + 1, 0, duplicatedEquation);
      onEquationsChange(next);
      onActiveEquationIdChange(duplicatedEquation.id);
    },
    [equations, onActiveEquationIdChange, onEquationsChange],
  );

  const duplicateEquationToEnd = useCallback(
    (id: string) => {
      const sourceEquation = equations.find((equation) => equation.id === id);
      if (!sourceEquation) return;

      const duplicatedEquation = duplicatePadEquation(sourceEquation);
      onEquationsChange([...equations, duplicatedEquation]);
      onActiveEquationIdChange(duplicatedEquation.id);
    },
    [equations, onActiveEquationIdChange, onEquationsChange],
  );

  const updateEquationState = useCallback(
    (id: string, rowUpdater: (current: EquationRowState) => EquationRowState) => {
      onEquationsChange(
        equations.map((candidate) =>
          candidate.id === id ? { ...candidate, state: rowUpdater(candidate.state) } : candidate,
        ),
      );
    },
    [equations, onEquationsChange],
  );

  const activateEquation = useCallback(
    (id: string) => {
      onActiveEquationIdChange(id);
    },
    [onActiveEquationIdChange],
  );

  const updateCopySurroundMode = useCallback(
    (value: EquationCopySurroundMode) => {
      onCopySurroundModeChange(value);
    },
    [onCopySurroundModeChange],
  );

  const getSubstituteSuggestionSources = useCallback(
    (equationId: string) => getSubstituteSuggestionSourcesForEquation(compiledSourcesByEquationId, equationId),
    [compiledSourcesByEquationId],
  );

  return {
    equations,
    activeEquationId,
    copySurroundMode,
    compiledSourcesByEquationId,
    addEquation,
    removeEquation,
    moveEquation,
    duplicateEquationAfter,
    duplicateEquationToEnd,
    updateEquationState,
    activateEquation,
    updateCopySurroundMode,
    getSubstituteSuggestionSources,
  };
}
