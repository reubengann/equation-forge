export type ClickKind = "single" | "double" | "multi";
export type PointerPhase = "pointer_down" | "pointer_up";

export type PointerEventRecord = {
  type: PointerPhase;
  nodeId: string | null;
  pointer: { x: number; y: number };
  pointerType: string;
  button: number;
  buttons: number;
  ts: number;
};

export type NodeClickEvent = {
  type: "node_click";
  nodeId: string | null;
  clickCount: number;
  clickKind: ClickKind;
  ts: number;
};

export type SelectionChangedEvent = {
  type: "selection_changed";
  previousNodeId: string | null;
  nextNodeId: string | null;
  ts: number;
};

export type TestRecorderEvent =
  | NodeClickEvent
  | SelectionChangedEvent
  | PointerEventRecord;

function toClickKind(clickCount: number): ClickKind {
  if (clickCount <= 1) return "single";
  if (clickCount === 2) return "double";
  return "multi";
}

export class TestRecorder {
  private events: TestRecorderEvent[] = [];

  startSession(): void {
    this.events = [];
  }

  recordNodeClick(payload: { nodeId: string | null; clickCount: number }): void {
    this.events.push({
      type: "node_click",
      nodeId: payload.nodeId,
      clickCount: payload.clickCount,
      clickKind: toClickKind(payload.clickCount),
      ts: Date.now(),
    });
  }

  recordSelectionChanged(payload: {
    previousNodeId: string | null;
    nextNodeId: string | null;
  }): void {
    this.events.push({
      type: "selection_changed",
      previousNodeId: payload.previousNodeId,
      nextNodeId: payload.nextNodeId,
      ts: Date.now(),
    });
  }

  recordPointerDown(payload: {
    nodeId: string | null;
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }): void {
    this.events.push({
      type: "pointer_down",
      nodeId: payload.nodeId,
      pointer: { x: payload.x, y: payload.y },
      pointerType: payload.pointerType,
      button: payload.button,
      buttons: payload.buttons,
      ts: Date.now(),
    });
  }

  recordPointerUp(payload: {
    nodeId: string | null;
    x: number;
    y: number;
    pointerType: string;
    button: number;
    buttons: number;
  }): void {
    this.events.push({
      type: "pointer_up",
      nodeId: payload.nodeId,
      pointer: { x: payload.x, y: payload.y },
      pointerType: payload.pointerType,
      button: payload.button,
      buttons: payload.buttons,
      ts: Date.now(),
    });
  }

  getEvents(): TestRecorderEvent[] {
    return [...this.events];
  }
}

