import { beforeEach, describe, expect, it, vi } from "vitest";

const setFontsDirectory = vi.hoisted(() => vi.fn());

vi.mock("mathlive", () => ({
  MathfieldElement: {
    set fontsDirectory(value: string) {
      setFontsDirectory(value);
    },
  },
}));

import { configureEquationForgeEnvironment } from "./configureEquationForgeEnvironment";

describe("configureEquationForgeEnvironment", () => {
  beforeEach(() => {
    setFontsDirectory.mockClear();
  });

  it("applies each fonts directory at most once consecutively", () => {
    configureEquationForgeEnvironment({ fontsDirectory: "/first-fonts" });
    configureEquationForgeEnvironment({ fontsDirectory: "/first-fonts" });
    configureEquationForgeEnvironment({ fontsDirectory: "/second-fonts" });

    expect(setFontsDirectory.mock.calls).toEqual([
      ["/first-fonts"],
      ["/second-fonts"],
    ]);
  });
});
