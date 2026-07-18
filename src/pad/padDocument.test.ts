import { describe, expect, it } from "vitest";
import { createEquationHistory } from "../EquationRowState";
import {
  DEFAULT_PAD_EQUATION_LATEX,
  duplicatePadEquation,
  parseStoredPadState,
  serializePadDocument,
  type PadEquation,
} from "./padDocument";

describe("pad document serialization", () => {
  it("restores serialized equations with history and function symbol metadata", () => {
    const history = createEquationHistory(String.raw`f \left(x\right)`, [{ nodeId: "n1", name: "f" }]);
    const parsed = parseStoredPadState({
      schemaVersion: 1,
      equations: [
        {
          id: "eq-1",
          latex: String.raw`f \left(x\right)`,
          functionSymbols: [{ nodeId: "n1", name: "f" }],
          history,
          mode: "display",
        },
      ],
    });

    expect(parsed.equations).toHaveLength(1);
    expect(parsed.equations[0]?.id).toBe("eq-1");
    expect(parsed.equations[0]?.state).toMatchObject({
      latex: String.raw`f \left(x\right)`,
      functionSymbols: [{ nodeId: "n1", name: "f" }],
      mode: "display",
    });
    expect(parsed.equations[0]?.state.history.present.functionSymbols).toEqual([
      { nodeId: "n1", name: "f" },
    ]);
  });

  it("falls back to a default equation for invalid stored state", () => {
    const parsed = parseStoredPadState({ schemaVersion: 999, equations: [] });

    expect(parsed.equations).toHaveLength(1);
    expect(parsed.equations[0]?.state.latex).toBe(DEFAULT_PAD_EQUATION_LATEX);
  });

  it("serializes the current pad schema", () => {
    const equation: PadEquation = {
      id: "eq-1",
      state: {
        latex: "a = b",
        functionSymbols: [],
        history: createEquationHistory("a = b"),
        mode: "display",
      },
    };

    expect(serializePadDocument({ equations: [equation] })).toEqual({
      schemaVersion: 1,
      equations: [
        {
          id: "eq-1",
          latex: "a = b",
          functionSymbols: [],
          history: createEquationHistory("a = b"),
          mode: "display",
        },
      ],
    });
  });

  it("duplicates equations without copying undo history", () => {
    const equation: PadEquation = {
      id: "eq-1",
      state: {
        latex: "b = c",
        functionSymbols: [{ nodeId: "n1", name: "f" }],
        history: {
          past: [{ latex: "a = c", functionSymbols: [] }],
          present: { latex: "b = c", functionSymbols: [{ nodeId: "n1", name: "f" }] },
          future: [],
        },
        mode: "display",
      },
    };

    const duplicated = duplicatePadEquation(equation);

    expect(duplicated.id).not.toBe(equation.id);
    expect(duplicated.state.latex).toBe("b = c");
    expect(duplicated.state.history).toEqual(createEquationHistory("b = c", [{ nodeId: "n1", name: "f" }]));
  });
});
