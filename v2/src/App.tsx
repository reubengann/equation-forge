import { useCallback, useRef, useState } from "react";
import EditorEntryToggle from "./EditorEntryToggle";
import type { EventFixture, ExportedEvent } from "./interaction/eventFixture";
import type { SelectionGeometry } from "./interaction/selectionController";
import type { CompiledMathDocument } from "./math/compile/compileMathDocument";
import { TestRecorder, type TestRecorderEvent } from "./TestRecorder";

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
  const enteredName = window.prompt(
    "Save As filename",
    defaultFileName,
  );
  const normalizedName = enteredName?.trim() || defaultFileName;
  a.download = normalizedName.toLowerCase().endsWith(".json")
    ? normalizedName
    : `${normalizedName}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const recorderRef = useRef<TestRecorder>(new TestRecorder());
  const compiledDocumentRef = useRef<CompiledMathDocument | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const lastDomSnapshotKeyRef = useRef<string | null>(null);
  const [recordedEvents, setRecordedEvents] = useState<TestRecorderEvent[]>([]);
  const [recordedEventCount, setRecordedEventCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const syncRecordedEvents = () => {
    const nextEvents = recorderRef.current.getEvents();
    setRecordedEvents(nextEvents);
    setRecordedEventCount(nextEvents.length);
  };

  const buildCompactExport = (
    events: TestRecorderEvent[],
  ): Pick<EventFixture, "domSnapshots" | "events"> => {
    const domSnapshots: EventFixture["domSnapshots"] = {};
    const snapshotIdByKey = new Map<string, string>();
    let snapshotCounter = 0;

    const compactEvents: ExportedEvent[] = events.map((event) => {
      switch (event.type) {
        case "pointer_down":
        case "pointer_up": {
          if (!event.domSnapshot) {
            return {
              type: event.type,
              pointer: event.pointer,
              domSnapshotId: null,
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
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
    const lastLatexAcceptedEvent = [...recordedEvents]
      .reverse()
      .find((event) => event.type === "latex_accepted");
    const compact = buildCompactExport(recordedEvents);
    const fixture: EventFixture = {
      schemaVersion: 1,
      exportedAtIso: new Date().toISOString(),
      domSnapshots: compact.domSnapshots,
      events: compact.events,
      expected: {
        selectedNodeId: selectedNodeIdRef.current,
        latex:
          lastLatexAcceptedEvent?.type === "latex_accepted"
            ? lastLatexAcceptedEvent.nextLatex
            : undefined,
      },
    };
    try {
      await saveFixtureJson(fixture);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to export fixture JSON", error);
    }
  };

  const maybeRecordDomChanged = useCallback(
    (
      source: "accept",
      domSnapshot: SelectionGeometry | null,
    ) => {
      if (!isRecording || !domSnapshot) return false;
      const nextKey = JSON.stringify(domSnapshot);
      if (lastDomSnapshotKeyRef.current === nextKey) return false;
      lastDomSnapshotKeyRef.current = nextKey;
      recorderRef.current.recordDomChanged({
        source,
        domSnapshot,
      });
      return true;
    },
    [isRecording],
  );

  const handleDomSnapshotObserved = useCallback(
    (domSnapshot: SelectionGeometry | null) => {
      if (maybeRecordDomChanged("accept", domSnapshot)) {
        syncRecordedEvents();
      }
    },
    [maybeRecordDomChanged],
  );

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
          data-testid="start-recording"
          onClick={() => {
            if (isRecording) {
              setIsRecording(false);
              return;
            }
            recorderRef.current.startSession();
            lastDomSnapshotKeyRef.current = null;
            setIsRecording(true);
            setRecordedEvents([]);
            setRecordedEventCount(0);
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
        selectedNodeId={selectedNodeId}
        onSelectionChanged={(nodeId) => {
          if (selectedNodeIdRef.current !== nodeId) {
            selectedNodeIdRef.current = nodeId;
            setSelectedNodeId(nodeId);
          }
        }}
        onCompiledDocumentChanged={(doc) => {
          compiledDocumentRef.current = doc;
        }}
        onDomSnapshotObserved={handleDomSnapshotObserved}
        onLatexAccepted={(payload) => {
          if (!isRecording) return;
          recorderRef.current.recordLatexAccepted(payload);
          syncRecordedEvents();
        }}
        onNodeClick={(nodeId, clickCount) => {
          if (!isRecording) return;
          recorderRef.current.recordNodeClick({ nodeId, clickCount });
          syncRecordedEvents();
        }}
        onPointerDownEvent={(payload) => {
          if (isRecording) {
            recorderRef.current.recordPointerDown(payload);
            syncRecordedEvents();
          }
        }}
        onPointerUpEvent={(payload) => {
          if (!isRecording) return;
          recorderRef.current.recordPointerUp(payload);
          syncRecordedEvents();
        }}
      />
      <div style={{ textAlign: "left", fontSize: "14px" }}>
        <div>Selected node: {selectedNodeId ?? "none"}</div>
        <div> Recorded events: {recordedEventCount} </div>
        <div>
          {recordedEvents
            .slice()
            .reverse()
            .slice(0, 20)
            .map((event: TestRecorderEvent, index) => {
              switch (event.type) {
                case "node_click":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Click {event.nodeId} {event.clickKind} (
                      {event.clickCount}{" "}
                      {event.clickCount === 1 ? "time" : "times"})
                    </div>
                  );
                case "pointer_down":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer down{" "}
                      {event.pointer.x} {event.pointer.y} {event.pointerType}{" "}
                      {event.button} {event.buttons} rects=
                      {event.domSnapshot?.nodeRects.length ?? 0}
                    </div>
                  );
                case "pointer_up":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer up{" "}
                      {event.pointer.x} rects=
                      {event.domSnapshot?.nodeRects.length ?? 0}{" "}
                    </div>
                  );
                case "latex_accepted":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Latex changed from{" "}
                      {event.previousLatex ?? "(none)"} to {event.nextLatex}
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
    </main>
  );
}

export default App;
