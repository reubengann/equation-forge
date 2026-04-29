import type { TestRecorderEvent } from "../TestRecorder";
import type { DomRectSnapshot } from "./selectionController";

export type ExportedPointerEvent = {
  type: "pointer_down" | "pointer_up";
  nodeId: string | null;
  pointer: { x: number; y: number };
  domSnapshotId: string | null;
  pointerType: string;
  button: number;
  buttons: number;
  ts: number;
};

export type ExportedDomChangedEvent = {
  type: "dom_changed";
  source: "accept";
  domSnapshotId: string | null;
  ts: number;
};

export type ExportedEvent =
  | ExportedPointerEvent
  | ExportedDomChangedEvent
  | Exclude<TestRecorderEvent, { type: "pointer_down" | "pointer_up" | "dom_changed" }>;

export type EventFixture = {
  schemaVersion: number;
  exportedAtIso: string;
  domSnapshots: Record<string, DomRectSnapshot>;
  events: ExportedEvent[];
  expected: {
    selectedNodeId?: string | null;
    latex?: string;
  };
};
