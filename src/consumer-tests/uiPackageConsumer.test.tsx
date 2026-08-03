import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  EquationForge,
  createDefaultPadDocument,
  type EquationForgeOptions,
  type PadEquation,
} from "@equation-forge/ui";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("@equation-forge/ui package", () => {
  it("mounts as a React 18 consumer and supports row lifecycle actions", () => {
    let latestEquations: PadEquation[] = [];

    function Consumer() {
      const initialDocument = createDefaultPadDocument();
      const [equations, setEquations] = useState(initialDocument.equations);
      const [activeEquationId, setActiveEquationId] = useState<string | null>(
        initialDocument.equations[0]?.id ?? null,
      );
      const [options, setOptions] = useState<EquationForgeOptions>({
        wrapEquationCopiesInDisplayMath: false,
      });
      latestEquations = equations;
      return (
        <EquationForge
          equations={equations}
          activeEquationId={activeEquationId}
          options={options}
          onEquationsChange={setEquations}
          onActiveEquationIdChange={setActiveEquationId}
          onOptionsChange={setOptions}
        />
      );
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Consumer />));

    const accept = container.querySelector<HTMLButtonElement>(
      '[data-testid="accept-equation"]',
    );
    act(() => accept?.click());
    expect(latestEquations[0]?.state.mode).toBe("display");

    const duplicate = container.querySelector<HTMLButtonElement>(
      '[data-testid="duplicate-pad-equation"]',
    );
    act(() => duplicate?.click());
    expect(latestEquations).toHaveLength(2);
    expect(latestEquations[1]?.state.latex).toBe(
      latestEquations[0]?.state.latex,
    );
  });
});
