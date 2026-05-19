import { describe, expect, it } from "vitest";
import { buildAssertions, replayEvents } from "../../scripts/mathtestReplay";
import type { EventFixture } from "../interaction/eventFixture";

describe("mathtest replay move mode", () => {
  it("replays and asserts move mode changes", () => {
    const fixture: EventFixture = {
      schemaVersion: 1,
      exportedAtIso: "2026-01-01T00:00:00.000Z",
      domSnapshots: {},
      events: [
        {
          type: "move_mode_changed",
          moveType: "multiplicative",
          ts: 1,
        },
      ],
      expected: {
        moveType: "multiplicative",
      },
    };

    const replayResult = replayEvents(fixture);

    expect(buildAssertions(fixture, replayResult)).toEqual([]);
  });
});
