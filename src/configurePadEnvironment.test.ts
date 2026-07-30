import { beforeEach, describe, expect, it, vi } from "vitest";

const setFontsDirectory = vi.hoisted(() => vi.fn());

vi.mock("mathlive", () => ({
  MathfieldElement: {
    set fontsDirectory(value: string) {
      setFontsDirectory(value);
    },
  },
}));

import { configurePadEnvironment } from "./configurePadEnvironment";

describe("configurePadEnvironment", () => {
  beforeEach(() => {
    setFontsDirectory.mockClear();
  });

  it("applies each fonts directory at most once consecutively", () => {
    configurePadEnvironment({ fontsDirectory: "/first-fonts" });
    configurePadEnvironment({ fontsDirectory: "/first-fonts" });
    configurePadEnvironment({ fontsDirectory: "/second-fonts" });

    expect(setFontsDirectory.mock.calls).toEqual([
      ["/first-fonts"],
      ["/second-fonts"],
    ]);
  });
});
