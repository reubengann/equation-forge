import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditorEntryToggle from "./EditorEntryToggle";
import { PadView } from "./PadView";
import type { EventFixture, ExportedEvent } from "./interaction/eventFixture";
import type {
  DomSnapshotObservedPayload,
  PointerEventPayload,
  SelectionGeometry,
} from "./interaction/selectionController";
import type { InsertionPreview, MoveType } from "./math/rewrite/types";
import { selectionNodeIds } from "./interaction/selectionController";
import type { TermSelection } from "./selection/types";
import { TestRecorder, type TestRecorderEvent } from "./TestRecorder";
import type { EquationEditorRecordingHooks } from "./EquationEditorRecordingHooks";
import { compileMathDocument, type CompiledMathDocument } from "./math/compile/compileMathDocument";
import type { Expr } from "./math/ast";
import { configureEquationForgeEnvironment } from "./configureEquationForgeEnvironment";

async function saveFixtureJson(fixture: EventFixture): Promise<void> {
  const json = `${JSON.stringify(fixture, null, 2)}\n`;
  const defaultFileName = `interaction-events-${Date.now()}.json`;

  const pickerHost = globalThis as typeof globalThis & {
    showSaveFilePicker?: (options?: {
      id?: string;
      startIn?: "downloads" | "documents" | "desktop" | "pictures" | "music" | "videos";
      excludeAcceptAllOption?: boolean;
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (pickerHost.showSaveFilePicker) {
    const handle = await pickerHost.showSaveFilePicker({
      id: "interaction-fixture-export",
      startIn: "downloads",
      excludeAcceptAllOption: false,
      suggestedName: defaultFileName,
      types: [
        {
          description: "JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const enteredName = window.prompt("Save As filename", defaultFileName);
  const normalizedName = enteredName?.trim() || defaultFileName;
  a.download = normalizedName.toLowerCase().endsWith(".json") ? normalizedName : `${normalizedName}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

configureEquationForgeEnvironment({ fontsDirectory: "/fonts" });

function summarizeDebugExpr(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return `value=${String(expr.value)}`;
    case "symbol":
      return `name=${expr.name}`;
    case "text":
      return `text=${JSON.stringify(expr.text)}`;
    case "call":
      return `delimiter=${expr.delimiter}`;
    case "display_group":
      return `delimiter=${expr.delimiter}`;
    case "dotted_expr":
    case "primed":
    case "multiple_integral":
      return `order=${expr.order}`;
    case "special_font":
      return `font=${expr.font}`;
    case "second_order_partial_derivative":
      return `degree=${expr.degree}`;
    case "user_function":
      return `name=${expr.name}`;
    case "inequality":
      return `operator=${expr.operator}`;
    case "immutable_expression":
    case "invalid_input":
      return `latex=${JSON.stringify(expr.latex)}`;
    default:
      return "";
  }
}

function renderDebugTree(doc: CompiledMathDocument, showNodeLabels: boolean): string {
  const { rootId, nodeById, childrenById, locationById } = doc.index;
  const lines: string[] = [];

  const walk = (nodeId: string, depth: number) => {
    const expr = nodeById[nodeId];
    if (!expr) {
      lines.push(`${"  ".repeat(depth)}- ${showNodeLabels ? `${nodeId} ` : ""}<missing>`);
      return;
    }

    const location = locationById[nodeId];
    const locationLabel =
      showNodeLabels && location?.field
        ? ` [${location.index == null ? location.field : `${location.field}[${location.index}]`}]`
        : "";
    const nodeLabel = showNodeLabels ? `${nodeId} ` : "";
    const summary = summarizeDebugExpr(expr);
    const summarySuffix = summary ? ` (${summary})` : "";
    lines.push(`${"  ".repeat(depth)}- ${nodeLabel}${expr.kind}${locationLabel}${summarySuffix}`);

    for (const childId of childrenById[nodeId] ?? []) {
      walk(childId, depth + 1);
    }
  };

  walk(rootId, 0);
  return lines.join("\n");
}

function isStopRecordingShortcut(event: KeyboardEvent): boolean {
  if (event.repeat) return false;
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && event.shiftKey && key === "s";
}

function App() {
  const recorderRef = useRef<TestRecorder>(new TestRecorder());
  const selectedNodeIdsRef = useRef<string[]>([]);
  const insertionPreviewRef = useRef<InsertionPreview | null>(null);
  const moveTypeRef = useRef<MoveType>("additive");
  const currentLatexRef = useRef<string | null>(null);
  const expectedAtStopRef = useRef<EventFixture["expected"] | null>(null);
  const lastDomSnapshotIdRef = useRef<string | null>(null);
  const snapshotByIdRef = useRef<Record<string, SelectionGeometry>>({});
  const [recordedEvents, setRecordedEvents] = useState<TestRecorderEvent[]>([]);
  const [recordedEventCount, setRecordedEventCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [view, setView] = useState<"pad" | "debug">("pad");
  const [debugLatex, setDebugLatex] = useState<string | null>(null);
  const [showDebugTreeLabels, setShowDebugTreeLabels] = useState(false);

  const debugTree = useMemo(() => {
    if (!debugLatex?.trim()) return null;
    try {
      return renderDebugTree(compileMathDocument(debugLatex), showDebugTreeLabels);
    } catch (error) {
      return error instanceof Error ? `Unable to compile current LaTeX: ${error.message}` : "Unable to compile current LaTeX.";
    }
  }, [debugLatex, showDebugTreeLabels]);

  const syncRecordedEvents = () => {
    const nextEvents = recorderRef.current.getEvents();
    setRecordedEvents(nextEvents);
    setRecordedEventCount(nextEvents.length);
  };

  const buildExpectedState = (): EventFixture["expected"] => {
    return {
      selectedNodeIds: selectedNodeIdsRef.current,
      insertionPreview: insertionPreviewRef.current,
      moveType: moveTypeRef.current,
      latex: currentLatexRef.current ?? undefined,
    };
  };

  const stopRecording = () => {
    expectedAtStopRef.current = buildExpectedState();
    setIsRecording(false);
  };

  const buildCompactExport = (events: TestRecorderEvent[]): Pick<EventFixture, "domSnapshots" | "events"> => {
    const domSnapshots: EventFixture["domSnapshots"] = {};
    const snapshotIdByKey = new Map<string, string>();
    let snapshotCounter = 0;

    const compactEvents: ExportedEvent[] = events.map((event) => {
      switch (event.type) {
        case "pointer_down":
        case "pointer_move":
        case "pointer_up": {
          if (!event.domSnapshot) {
            return {
              type: event.type,
              pointer: event.pointer,
              domSnapshotId: null,
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              ctrlKey: event.ctrlKey,
              ts: event.ts,
            };
          }

          const key = JSON.stringify(event.domSnapshot);
          let snapshotId = snapshotIdByKey.get(key);
          if (!snapshotId) {
            snapshotCounter += 1;
            snapshotId = `s${snapshotCounter}`;
            snapshotIdByKey.set(key, snapshotId);
            domSnapshots[snapshotId] = event.domSnapshot;
          }

          return {
            type: event.type,
            pointer: event.pointer,
            domSnapshotId: snapshotId,
            pointerType: event.pointerType,
            button: event.button,
            buttons: event.buttons,
            ctrlKey: event.ctrlKey,
            ts: event.ts,
          };
        }
        case "dom_changed": {
          const key = JSON.stringify(event.domSnapshot);
          let snapshotId = snapshotIdByKey.get(key);
          if (!snapshotId) {
            snapshotCounter += 1;
            snapshotId = `s${snapshotCounter}`;
            snapshotIdByKey.set(key, snapshotId);
            domSnapshots[snapshotId] = event.domSnapshot;
          }
          return {
            type: "dom_changed",
            source: event.source,
            domSnapshotId: snapshotId,
            ts: event.ts,
          };
        }
        default:
          return event;
      }
    });

    return { domSnapshots, events: compactEvents };
  };

  const exportEventsAsJson = async () => {
    const compact = buildCompactExport(recordedEvents);
    const fixture: EventFixture = {
      schemaVersion: 1,
      exportedAtIso: new Date().toISOString(),
      domSnapshots: compact.domSnapshots,
      events: compact.events,
      expected: expectedAtStopRef.current ?? buildExpectedState(),
    };
    try {
      await saveFixtureJson(fixture);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to export fixture JSON", error);
    }
  };

  const maybeRecordDomChanged = useCallback(
    (source: "accept", domSnapshotId: string | null, domSnapshot: SelectionGeometry | null) => {
      if (!isRecording || !domSnapshot) return false;
      if (domSnapshotId === lastDomSnapshotIdRef.current) return false;
      lastDomSnapshotIdRef.current = domSnapshotId;
      recorderRef.current.recordDomChanged({
        source,
        domSnapshot,
      });
      return true;
    },
    [isRecording],
  );

  const handleDomSnapshotObserved = useCallback(
    ({ domSnapshotId, domSnapshot }: DomSnapshotObservedPayload) => {
      if (domSnapshotId && domSnapshot) {
        snapshotByIdRef.current[domSnapshotId] = domSnapshot;
      }
      if (maybeRecordDomChanged("accept", domSnapshotId, domSnapshot)) {
        syncRecordedEvents();
      }
    },
    [maybeRecordDomChanged],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isRecording) return;
      if (!isStopRecordingShortcut(event)) return;
      event.preventDefault();
      stopRecording();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isRecording]);

  return (
    <main
      className="app-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          data-testid="show-pad-view"
          onClick={() => setView("pad")}
          style={{
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: view === "pad" ? "#7c4dff" : "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px 12px",
            whiteSpace: "nowrap",
          }}
        >
          Pad
        </button>
        <button
          type="button"
          data-testid="show-debug-view"
          onClick={() => setView("debug")}
          style={{
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: view === "debug" ? "#7c4dff" : "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px 12px",
            whiteSpace: "nowrap",
          }}
        >
          Debug
        </button>
      </div>
      {view === "pad" ? (
        <PadView />
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          data-testid="start-recording"
          onClick={() => {
            if (isRecording) {
              stopRecording();
              return;
            }
            recorderRef.current.startSession();
            recorderRef.current.recordMoveModeChanged(moveTypeRef.current);
            lastDomSnapshotIdRef.current = null;
            snapshotByIdRef.current = {};
            insertionPreviewRef.current = null;
            expectedAtStopRef.current = null;
            setIsRecording(true);
            syncRecordedEvents();
          }}
          style={{
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px 12px",
            whiteSpace: "nowrap",
          }}
        >
          {isRecording ? "Stop recording" : "Start recording"}
        </button>
        {isRecording && (
          <span style={{ fontSize: "12px", opacity: 0.8, alignSelf: "center" }}>
            Stop shortcut: Ctrl/Cmd+Shift+S
          </span>
        )}
        <button
          type="button"
          data-testid="export-events-json"
          onClick={() => {
            void exportEventsAsJson();
          }}
          disabled={recordedEvents.length === 0}
          style={{
            boxSizing: "border-box",
            border: "1px solid #757575",
            borderRadius: "3px",
            background: "#424242",
            color: "rgba(255, 255, 255, 0.87)",
            padding: "8px 12px",
            whiteSpace: "nowrap",
            opacity: recordedEvents.length === 0 ? 0.55 : 1,
            cursor: recordedEvents.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Export events JSON
        </button>
      </div>
      <EditorEntryToggle
        onLatexAccepted={(payload) => {
          currentLatexRef.current = payload.nextLatex;
          setDebugLatex(payload.nextLatex);
          // We can record this ourselves, since we are the actor
          if (!isRecording) return;
          recorderRef.current.recordLatexAccepted(payload);
          syncRecordedEvents();
        }}
        onCanonicalLatexChanged={(nextLatex) => {
          currentLatexRef.current = nextLatex;
          setDebugLatex(nextLatex);
        }}
        recordingHooks={
          {
            onDomSnapshotObserved: handleDomSnapshotObserved,
            onPointerDownEvent: (payload: PointerEventPayload) => {
              if (!isRecording) return;
              const domSnapshot = payload.domSnapshotId
                ? (snapshotByIdRef.current[payload.domSnapshotId] ?? null)
                : null;
              recorderRef.current.recordPointerDown({
                x: payload.x,
                y: payload.y,
                domSnapshot,
                pointerType: payload.pointerType,
                button: payload.button,
                buttons: payload.buttons,
                ctrlKey: payload.ctrlKey,
              });
              syncRecordedEvents();
            },
            onPointerMoveEvent: (payload: PointerEventPayload) => {
              if (!isRecording) return;
              const domSnapshot = payload.domSnapshotId
                ? (snapshotByIdRef.current[payload.domSnapshotId] ?? null)
                : null;
              recorderRef.current.recordPointerMove({
                x: payload.x,
                y: payload.y,
                domSnapshot,
                pointerType: payload.pointerType,
                button: payload.button,
                buttons: payload.buttons,
                ctrlKey: payload.ctrlKey,
              });
              syncRecordedEvents();
            },
            onPointerUpEvent: (payload: PointerEventPayload) => {
              if (!isRecording) return;
              const domSnapshot = payload.domSnapshotId
                ? (snapshotByIdRef.current[payload.domSnapshotId] ?? null)
                : null;
              recorderRef.current.recordPointerUp({
                x: payload.x,
                y: payload.y,
                domSnapshot,
                pointerType: payload.pointerType,
                button: payload.button,
                buttons: payload.buttons,
                ctrlKey: payload.ctrlKey,
              });
              syncRecordedEvents();
            },
            onSelectionChanged: (selection: TermSelection | null) => {
              // We do not store selectionchanged events into the recording. This is just for
              // Showing on the UI for debugging purposes.
              const nodeIds = selectionNodeIds(selection);
              const oldKey = selectedNodeIdsRef.current.join(",");
              const nextKey = nodeIds.join(",");
              if (oldKey !== nextKey) {
                selectedNodeIdsRef.current = nodeIds;
                setSelectedNodeIds(nodeIds);
              }
            },
            onPreviewChanged: (preview: InsertionPreview | null) => {
              insertionPreviewRef.current = preview;
            },
            onMoveTypeChanged: (moveType: MoveType) => {
              if (moveTypeRef.current === moveType) return;
              moveTypeRef.current = moveType;
              if (!isRecording) return;
              recorderRef.current.recordMoveModeChanged(moveType);
              syncRecordedEvents();
            },
          } satisfies EquationEditorRecordingHooks
        }
      />
      <div style={{ textAlign: "left", fontSize: "14px" }}>
        <div>Selected nodes: {selectedNodeIds.length > 0 ? selectedNodeIds.join(", ") : "none"}</div>
        <div> Recorded events: {recordedEventCount} </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 0" }}>
          <input
            type="checkbox"
            checked={showDebugTreeLabels}
            onChange={(event) => setShowDebugTreeLabels(event.currentTarget.checked)}
          />
          Show tree with node labels
        </label>
        {showDebugTreeLabels && (
          <pre
            data-testid="debug-node-tree"
            style={{
              maxHeight: "320px",
              overflow: "auto",
              padding: "8px",
              border: "1px solid #555",
              borderRadius: "3px",
              background: "#1e1e1e",
              color: "rgba(255, 255, 255, 0.87)",
              fontSize: "12px",
              lineHeight: 1.35,
              whiteSpace: "pre",
            }}
          >
            {debugTree ?? "Accept or change an equation to show its compiled tree."}
          </pre>
        )}
        <div>
          {recordedEvents
            .slice() // Seems goofy, but I need to take the 20 most recent *in reverse order*, so slice(-20, 0) doesn't work
            .reverse()
            .slice(0, 20)
            .map((event: TestRecorderEvent, index) => {
              switch (event.type) {
                case "pointer_down":
                case "pointer_move":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer {event.type === "pointer_down" ? "down" : "move"} {event.pointer.x}{" "}
                      {event.pointer.y} {event.pointerType}{" "}
                      {event.button} {event.buttons} ctrl={event.ctrlKey ? "1" : "0"} rects=
                      {event.domSnapshot?.nodeRects.length ?? 0}
                    </div>
                  );
                case "pointer_up":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer up {event.pointer.x} rects=
                      {event.domSnapshot?.nodeRects.length ?? 0}{" "}
                    </div>
                  );
                case "latex_accepted":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Latex changed from {event.previousLatex ?? "(none)"} to {event.nextLatex}
                    </div>
                  );
                case "move_mode_changed":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: {event.moveType}
                    </div>
                  );
                case "dom_changed":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: source={event.source} rects=
                      {event.domSnapshot.nodeRects.length}
                    </div>
                  );
              }
            })}
        </div>
      </div>
        </>
      )}
    </main>
  );
}

export default App;
