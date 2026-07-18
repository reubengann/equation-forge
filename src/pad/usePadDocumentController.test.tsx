import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEquationRowState } from "../EquationRowState";
import {
  buildPadDefinitionSources,
  getSubstituteSuggestionSourcesForEquation,
  usePadDocumentController,
} from "./usePadDocumentController";
import type { PadEquation } from "./padDocument";

type Controller = ReturnType<typeof usePadDocumentController>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

function mount(element: ReactElement) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
}

function createEquation(id: string, latex: string, mode: "entry" | "display" = "display"): PadEquation {
  return {
    id,
    state: createEquationRowState(latex, mode),
  };
}

describe("pad document controller", () => {
  it("builds display-mode definition sources and excludes the active equation from suggestions", () => {
    const sources = buildPadDefinitionSources([
      createEquation("eq-1", String.raw`F = m a`),
      createEquation("eq-2", String.raw`x = y + z`),
      createEquation("eq-3", String.raw`draft = value`, "entry"),
    ]);

    expect([...sources.keys()]).toEqual(["eq-1", "eq-2"]);
    expect(getSubstituteSuggestionSourcesForEquation(sources, "eq-1").map((source) => source.equationId)).toEqual([
      "eq-2",
    ]);
  });

  it("adds, moves, removes, and activates equations through injected state callbacks", () => {
    let controller: Controller | null = null;
    let latestEquations: PadEquation[] = [];
    let latestActiveEquationId: string | null = null;

    function Harness() {
      const [equations, setEquations] = useState<PadEquation[]>([
        createEquation("eq-1", "a = b"),
        createEquation("eq-2", "b = c"),
      ]);
      const [activeEquationId, setActiveEquationId] = useState<string | null>("eq-1");
      const [wrapEquationCopiesInDisplayMath, setWrapEquationCopiesInDisplayMath] = useState(false);
      controller = usePadDocumentController({
        equations,
        activeEquationId,
        wrapEquationCopiesInDisplayMath,
        onEquationsChange: setEquations,
        onActiveEquationIdChange: setActiveEquationId,
        onWrapEquationCopiesInDisplayMathChange: setWrapEquationCopiesInDisplayMath,
      });
      latestEquations = equations;
      latestActiveEquationId = activeEquationId;
      return null;
    }

    mount(<Harness />);

    act(() => controller?.addEquation());
    expect(latestEquations).toHaveLength(3);
    expect(latestActiveEquationId).toBe(latestEquations[2]?.id);

    act(() => controller?.moveEquation("eq-2", -1));
    expect(latestEquations.map((equation) => equation.id).slice(0, 2)).toEqual(["eq-2", "eq-1"]);

    act(() => controller?.removeEquation(latestActiveEquationId ?? ""));
    expect(latestEquations).toHaveLength(2);
    expect(latestActiveEquationId).toBe("eq-2");
  });
});
