import { describe, expect, it } from "vitest";
import { appendEquationHistoryStep, createEquationHistory } from "./EquationRowState";

describe("equation history", () => {
  it("appends accepted edits without discarding existing history", () => {
    const first = createEquationHistory(String.raw`a + b = c`);
    const second = appendEquationHistoryStep(first, String.raw`a = c - b`);
    const third = appendEquationHistoryStep(second, String.raw`b = c - a`);

    expect(third.past.map((step) => step.latex)).toEqual([
      String.raw`a + b = c`,
      String.raw`a = c - b`,
    ]);
    expect(third.present.latex).toBe(String.raw`b = c - a`);
    expect(third.future).toEqual([]);
  });

  it("updates present metadata without adding a history entry for unchanged latex", () => {
    const functionSymbols = [{ nodeId: "n1", name: "f" }];
    const history = appendEquationHistoryStep(
      createEquationHistory(String.raw`f \left(x\right)`),
      String.raw`f \left(x\right)`,
      functionSymbols,
    );

    expect(history.past).toEqual([]);
    expect(history.present).toEqual({
      latex: String.raw`f \left(x\right)`,
      functionSymbols,
    });
    expect(history.future).toEqual([]);
  });
});
