export type ClickKind = "single" | "double" | "multi";
export type PointerPhase = "pointer_down" | "pointer_up";

export type PointerEventRecord = {
  type: PointerPhase;
  nodeId: string | null;
  pointer: { x: number; y: number };
  domSnapshot: {
    mathDivRect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
    nodeRects: Array<{
      nodeId: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }>;
  } | null;
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

export type LatexAcceptedEvent = {
  type: "latex_accepted";
  previousLatex: string | null;
  nextLatex: string;
  ts: number;
};

export type DomChangedEvent = {
  type: "dom_changed";
  source: "accept";
  domSnapshot: {
    mathDivRect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
    nodeRects: Array<{
      nodeId: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }>;
  };
  ts: number;
};

export type TestRecorderEvent =
  | NodeClickEvent
  | PointerEventRecord
  | LatexAcceptedEvent
  | DomChangedEvent;

function toClickKind(clickCount: number): ClickKind {
  if (clickCount <= 1) return "single";
  if (clickCount === 2) return "double";
  return "multi";
}

export class TestRecorder {
  private events: TestRecorderEvent[] = [];
  private lastAcceptedLatex: string | null = null;

  startSession(): void {
    this.events = [];
    this.lastAcceptedLatex = null;
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

  recordPointerDown(payload: {
    nodeId: string | null;
    x: number;
    y: number;
    domSnapshot: {
      mathDivRect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      };
      nodeRects: Array<{
        nodeId: string;
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      }>;
    } | null;
    pointerType: string;
    button: number;
    buttons: number;
  }): void {
    this.events.push({
      type: "pointer_down",
      nodeId: payload.nodeId,
      pointer: { x: payload.x, y: payload.y },
      domSnapshot: payload.domSnapshot,
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
    domSnapshot: {
      mathDivRect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      };
      nodeRects: Array<{
        nodeId: string;
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      }>;
    } | null;
    pointerType: string;
    button: number;
    buttons: number;
  }): void {
    this.events.push({
      type: "pointer_up",
      nodeId: payload.nodeId,
      pointer: { x: payload.x, y: payload.y },
      domSnapshot: payload.domSnapshot,
      pointerType: payload.pointerType,
      button: payload.button,
      buttons: payload.buttons,
      ts: Date.now(),
    });
  }

  recordLatexAccepted(payload: {
    previousLatex: string | null;
    nextLatex: string;
  }): void {
    if (this.lastAcceptedLatex === payload.nextLatex) {
      return;
    }
    this.events.push({
      type: "latex_accepted",
      previousLatex: payload.previousLatex,
      nextLatex: payload.nextLatex,
      ts: Date.now(),
    });
    this.lastAcceptedLatex = payload.nextLatex;
  }

  recordDomChanged(payload: {
    source: "accept";
    domSnapshot: {
      mathDivRect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      };
      nodeRects: Array<{
        nodeId: string;
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      }>;
    };
  }): void {
    this.events.push({
      type: "dom_changed",
      source: payload.source,
      domSnapshot: payload.domSnapshot,
      ts: Date.now(),
    });
  }

  getEvents(): TestRecorderEvent[] {
    return [...this.events];
  }
}

