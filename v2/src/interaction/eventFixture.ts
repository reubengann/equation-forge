import type { TestRecorderEvent } from "../TestRecorder";
import type { SelectionGeometry } from "./selectionController";

export type ExportedPointerEvent = {
  type: "pointer_down" | "pointer_up";
  pointer: { x: number; y: number };
  domSnapshotId: string | null;
  pointerType: string;
  button: number;
  buttons: number;
  ctrlKey: boolean;
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
  domSnapshots: Record<string, SelectionGeometry>;
  events: ExportedEvent[];
  expected: {
    selectedNodeIds?: string[];
    selectedNodeId?: string | null;
    latex?: string;
  };
};
