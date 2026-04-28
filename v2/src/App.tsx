import { useRef, useState } from "react";
import EditorEntryToggle from "./EditorEntryToggle";
import { TestRecorder, type TestRecorderEvent } from "./TestRecorder";

type EventFixture = {
  schemaVersion: 1;
  exportedAtIso: string;
  events: TestRecorderEvent[];
  expected: {
    selectedNodeId?: string | null;
    latex?: string;
  };
};

async function saveFixtureJson(fixture: EventFixture): Promise<void> {
  const json = `${JSON.stringify(fixture, null, 2)}\n`;
  const fileName = `interaction-events-${Date.now()}.json`;

  const filePickerHost = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
  };

  if (filePickerHost.showSaveFilePicker) {
    const handle = await filePickerHost.showSaveFilePicker({
      suggestedName: fileName,
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
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const recorderRef = useRef<TestRecorder>(new TestRecorder());
  const selectedNodeIdRef = useRef<string | null>(null);
  const [recordedEvents, setRecordedEvents] = useState<TestRecorderEvent[]>([]);
  const [recordedEventCount, setRecordedEventCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const syncRecordedEvents = () => {
    const nextEvents = recorderRef.current.getEvents();
    setRecordedEvents(nextEvents);
    setRecordedEventCount(nextEvents.length);
  };

  const exportEventsAsJson = async () => {
    const lastLatexAcceptedEvent = [...recordedEvents]
      .reverse()
      .find((event) => event.type === "latex_accepted");
    const fixture: EventFixture = {
      schemaVersion: 1,
      exportedAtIso: new Date().toISOString(),
      events: recordedEvents,
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
          const previousNodeId = selectedNodeIdRef.current;
          if (previousNodeId !== payload.nodeId) {
            selectedNodeIdRef.current = payload.nodeId;
            setSelectedNodeId(payload.nodeId);
            if (isRecording) {
              recorderRef.current.recordSelectionChanged({
                previousNodeId,
                nextNodeId: payload.nodeId,
              });
            }
          }
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
                case "selection_changed":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}:{" "}
                      {event.nextNodeId
                        ? `Selection changed to ${event.nextNodeId}`
                        : "Selection cleared"}
                    </div>
                  );
                case "pointer_down":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer down {event.nodeId}{" "}
                      {event.pointer.x} {event.pointer.y} {event.pointerType}{" "}
                      {event.button} {event.buttons}
                    </div>
                  );
                case "pointer_up":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Pointer up {event.nodeId}{" "}
                      {event.pointer.x}{" "}
                    </div>
                  );
                case "latex_accepted":
                  return (
                    <div key={`${event.ts}-${index}`}>
                      {event.type}: Latex changed from{" "}
                      {event.previousLatex ?? "(none)"} to {event.nextLatex}
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
