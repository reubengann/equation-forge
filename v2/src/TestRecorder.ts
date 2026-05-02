import type {
  DomSnapshotObservedPayload,
  PointerEventPayload,
  Selection,
  SelectionGeometry,
} from "./interaction/selectionController";

export type PointerPhase = "pointer_down" | "pointer_up";

export type PointerEventRecord = {
  type: PointerPhase;
  pointer: { x: number; y: number };
  domSnapshot: SelectionGeometry | null;
  pointerType: string;
  button: number;
  buttons: number;
  ctrlKey: boolean;
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
  domSnapshot: SelectionGeometry;
  ts: number;
};

export type TestRecorderEvent =
  | PointerEventRecord
  | LatexAcceptedEvent
  | DomChangedEvent;

export type EquationEditorRecordingHooks = {
  onDomSnapshotObserved: (payload: DomSnapshotObservedPayload) => void;
  onPointerDownEvent: (payload: PointerEventPayload) => void;
  onPointerUpEvent: (payload: PointerEventPayload) => void;
  onSelectionChanged: (selection: Selection | null) => void;
};

export class TestRecorder {
  private events: TestRecorderEvent[] = [];
  private lastAcceptedLatex: string | null = null;

  startSession(): void {
    this.events = [];
    this.lastAcceptedLatex = null;
  }

  recordPointerDown(payload: {
    x: number;
    y: number;
    domSnapshot: SelectionGeometry | null;
    pointerType: string;
    button: number;
    buttons: number;
    ctrlKey: boolean;
  }): void {
    this.events.push({
      type: "pointer_down",
      pointer: { x: payload.x, y: payload.y },
      domSnapshot: payload.domSnapshot,
      pointerType: payload.pointerType,
      button: payload.button,
      buttons: payload.buttons,
      ctrlKey: payload.ctrlKey,
      ts: Date.now(),
    });
  }

  recordPointerUp(payload: {
    x: number;
    y: number;
    domSnapshot: SelectionGeometry | null;
    pointerType: string;
    button: number;
    buttons: number;
    ctrlKey: boolean;
  }): void {
    this.events.push({
      type: "pointer_up",
      pointer: { x: payload.x, y: payload.y },
      domSnapshot: payload.domSnapshot,
      pointerType: payload.pointerType,
      button: payload.button,
      buttons: payload.buttons,
      ctrlKey: payload.ctrlKey,
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
    domSnapshot: SelectionGeometry;
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
