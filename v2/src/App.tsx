import { useRef, useState } from "react";
import EditorEntryToggle from "./EditorEntryToggle";
import { TestRecorder, type TestRecorderEvent } from "./TestRecorder";

function App() {
  const recorderRef = useRef<TestRecorder>(new TestRecorder());
  const [recordedEvents, setRecordedEvents] = useState<TestRecorderEvent[]>([]);
  const [recordedEventCount, setRecordedEventCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const syncRecordedEvents = () => {
    const nextEvents = recorderRef.current.getEvents();
    setRecordedEvents(nextEvents);
    setRecordedEventCount(nextEvents.length);
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
      </div>
      <EditorEntryToggle
        recordedEventCount={recordedEventCount}
        onSelectionChanged={(payload) => {
          if (!isRecording) return;
          recorderRef.current.recordSelectionChanged(payload);
          syncRecordedEvents();
        }}
        onNodeClick={(nodeId, clickCount) => {
          if (!isRecording) return;
          recorderRef.current.recordNodeClick({ nodeId, clickCount });
          syncRecordedEvents();
        }}
        onPointerDownEvent={(payload) => {
          if (!isRecording) return;
          recorderRef.current.recordPointerDown(payload);
          syncRecordedEvents();
        }}
        onPointerUpEvent={(payload) => {
          if (!isRecording) return;
          recorderRef.current.recordPointerUp(payload);
          syncRecordedEvents();
        }}
      />
      <div style={{ textAlign: "left" }}>
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
                    {event.type}: Pointer down {event.nodeId} {event.pointer.x}{" "}
                    {event.pointer.y} {event.pointerType} {event.button}{" "}
                    {event.buttons}
                  </div>
                );
              case "pointer_up":
                return (
                  <div key={`${event.ts}-${index}`}>
                    {event.type}: Pointer up {event.nodeId}{" "}
                    {event.pointer.x}{" "}
                  </div>
                );
            }
          })}
      </div>
    </main>
  );
}

export default App;
