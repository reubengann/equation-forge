import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MathEntry } from "./MathEntry";

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

function render(element: ReactElement) {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(element);
  });
}

describe("MathEntry", () => {
  it("synchronizes external latex changes to the math field property", () => {
    const props = {
      onLatexChange: () => undefined,
      onAccept: () => undefined,
    };

    render(<MathEntry latex="y" {...props} />);
    const field = container?.querySelector<HTMLElement & { value?: string }>("math-field");
    expect(field?.value).toBe("y");

    render(<MathEntry latex="x^2" {...props} />);
    expect(field?.value).toBe("x^2");
    expect(field?.getAttribute("value")).toBe("x^2");
  });
});
