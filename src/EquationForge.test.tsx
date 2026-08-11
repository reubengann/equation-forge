import { act, createRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  EquationForge,
  type EquationForgeCommands,
  type EquationForgeOptions,
} from "./EquationForge";
import { createEquationRowState } from "./EquationRowState";
import { compileMathDocument } from "./math/compile/compileMathDocument";
import type { PadEquation } from "./pad/padDocument";

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

describe("EquationForge commands", () => {
  it("replaces and accepts the active equation entry through the public command ref", () => {
    const commandsRef = createRef<EquationForgeCommands>();
    const originalLatex = compileMathDocument("x = y").plainLatex;
    const insertedLatex = String.raw`F=ma`;
    const canonicalInsertedLatex =
      compileMathDocument(insertedLatex).plainLatex;
    let latestEquations: PadEquation[] = [];
    let latestOptions: EquationForgeOptions | null = null;

    function Harness() {
      const [equations, setEquations] = useState<PadEquation[]>([
        {
          id: "eq-1",
          state: createEquationRowState("x = y", "display"),
        },
      ]);
      const [activeEquationId, setActiveEquationId] = useState<string | null>(
        "eq-1",
      );
      const [options, setOptions] = useState<EquationForgeOptions>({
        copySurroundMode: "none",
        showEquationNumbers: true,
      });
      latestEquations = equations;
      latestOptions = options;
      return (
        <EquationForge
          ref={commandsRef}
          equations={equations}
          activeEquationId={activeEquationId}
          options={options}
          onEquationsChange={setEquations}
          onActiveEquationIdChange={setActiveEquationId}
          onOptionsChange={setOptions}
        />
      );
    }

    mount(<Harness />);

    act(() => commandsRef.current?.replaceEntryLatex(insertedLatex));
    expect(latestEquations[0]?.state).toMatchObject({
      latex: insertedLatex,
      mode: "entry",
    });
    expect(latestEquations[0]?.state.history.present.latex).toBe(originalLatex);

    act(() => commandsRef.current?.acceptEntry());
    expect(latestEquations[0]?.state).toMatchObject({
      latex: canonicalInsertedLatex,
      mode: "display",
    });
    expect(
      latestEquations[0]?.state.history.past.map((step) => step.latex),
    ).toEqual([originalLatex]);
    expect(latestEquations[0]?.state.history.present.latex).toBe(
      canonicalInsertedLatex,
    );

    const newEquationLatex = String.raw`E=mc^2`;
    act(() => commandsRef.current?.addEquation(newEquationLatex));
    expect(latestEquations).toHaveLength(2);
    expect(latestEquations[1]?.state).toMatchObject({
      latex: newEquationLatex,
      mode: "entry",
    });

    const existingEquations = JSON.stringify(latestEquations);
    const displayEquationLatex = String.raw`pV=nRT`;
    act(() =>
      commandsRef.current?.addEquation(displayEquationLatex, "display"),
    );
    expect(latestEquations).toHaveLength(3);
    expect(JSON.stringify(latestEquations.slice(0, 2))).toBe(existingEquations);
    expect(latestEquations[2]?.state).toMatchObject({
      latex: compileMathDocument(displayEquationLatex).plainLatex,
      mode: "display",
    });

    act(() => commandsRef.current?.setCopySurroundMode("equation-environment"));
    expect(latestOptions).toMatchObject({
      copySurroundMode: "equation-environment",
    });

    act(() => commandsRef.current?.setShowEquationNumbers(false));
    expect(latestOptions).toMatchObject({ showEquationNumbers: false });
  });

  it("provides read-only equation context to host actions", () => {
    const equation: PadEquation = {
      id: "eq-host-action",
      state: createEquationRowState("E = m c^2", "display"),
    };
    const before = JSON.stringify(equation);
    let receivedEquationId: string | null = null;

    mount(
      <EquationForge
        equations={[equation]}
        activeEquationId={equation.id}
        options={{ copySurroundMode: "none", showEquationNumbers: true }}
        onEquationsChange={() => undefined}
        onActiveEquationIdChange={() => undefined}
        onOptionsChange={() => undefined}
        renderEquationActions={(context) => (
          <button
            type="button"
            data-testid="host-equation-action"
            onClick={() => {
              receivedEquationId = context.equation.id;
            }}
          >
            Copy to host
          </button>
        )}
      />,
    );

    const action = container?.querySelector<HTMLButtonElement>(
      '[data-testid="host-equation-action"]',
    );
    act(() => action?.click());

    expect(receivedEquationId).toBe(equation.id);
    expect(JSON.stringify(equation)).toBe(before);
  });

  it("allows equation rows to shrink with a narrow host container", () => {
    const equation: PadEquation = {
      id: "eq-responsive",
      state: createEquationRowState("x = y", "display"),
    };
    const entryEquation: PadEquation = {
      id: "eq-responsive-entry",
      state: createEquationRowState("a + b = c", "entry"),
    };

    mount(
      <EquationForge
        equations={[equation, entryEquation]}
        activeEquationId={equation.id}
        options={{ copySurroundMode: "none", showEquationNumbers: true }}
        onEquationsChange={() => undefined}
        onActiveEquationIdChange={() => undefined}
        onOptionsChange={() => undefined}
      />,
    );

    const forge = container?.querySelector<HTMLElement>(".equation-forge-ui");
    const row = container?.querySelector<HTMLElement>(
      '[data-testid="pad-equation"]',
    );
    const moveGroup = container?.querySelector<HTMLElement>(
      '[aria-label="Move mode"]',
    );
    const toolbar = moveGroup?.parentElement;
    const acceptButton = container?.querySelector<HTMLButtonElement>(
      '[data-testid="accept-equation"]',
    );
    const duplicateButton = container?.querySelector<HTMLButtonElement>(
      '[data-testid="duplicate-pad-equation"]',
    );
    const mathField = container?.querySelector<HTMLElement>(
      '[data-testid="latex-mathfield"]',
    );

    expect(forge?.style.minWidth).toBe("0px");
    expect(row?.style.width).toBe("100%");
    expect(row?.style.minWidth).toBe("0px");
    expect(toolbar?.style.maxWidth).toBe("100%");
    expect(toolbar?.style.flexWrap).toBe("wrap");
    expect(moveGroup?.style.flexWrap).toBe("wrap");
    expect(acceptButton?.style.flexShrink).toBe("0");
    expect(acceptButton?.parentElement).toBe(duplicateButton?.parentElement);
    expect(mathField?.style.maxWidth).toBe("100%");
    expect(mathField?.parentElement?.style.overflow).toBe("hidden");
  });

  it("can suppress the header and equation number badges", () => {
    const equation: PadEquation = {
      id: "eq-embedded",
      state: createEquationRowState("x = y", "display"),
    };

    mount(
      <EquationForge
        equations={[equation]}
        activeEquationId={equation.id}
        options={{
          copySurroundMode: "display-math",
          showEquationNumbers: false,
        }}
        onEquationsChange={() => undefined}
        onActiveEquationIdChange={() => undefined}
        onOptionsChange={() => undefined}
        showHeader={false}
      />,
    );

    expect(container?.querySelector("h1")).toBeNull();
    expect(container?.textContent).not.toContain("(1)");
  });
});
