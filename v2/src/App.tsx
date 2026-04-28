import { useRef, useState } from "react";
import EditorEntryToggle from "./EditorEntryToggle";
import { TestRecorder } from "./TestRecorder";

function App() {
  const recorderRef = useRef<TestRecorder>(new TestRecorder());
  const [recordingSessionKey, setRecordingSessionKey] = useState(0);
  const [recordedEventCount, setRecordedEventCount] = useState(0);

  const updateRecordedEventCount = () => {
    setRecordedEventCount(recorderRef.current.getEvents().length);
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
      <div style={{ display: "flex" }}>
        <button
          type="button"
          data-testid="start-recording"
          onClick={() => {
            recorderRef.current.startSession();
            setRecordedEventCount(0);
            setRecordingSessionKey((prev) => prev + 1);
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
          Start recording
        </button>
      </div>
      <EditorEntryToggle
        key={recordingSessionKey}
        recordedEventCount={recordedEventCount}
        onSelectionChanged={(payload) => {
          recorderRef.current.recordSelectionChanged(payload);
          updateRecordedEventCount();
        }}
        onNodeClick={(nodeId, clickCount) => {
          recorderRef.current.recordNodeClick({ nodeId, clickCount });
          updateRecordedEventCount();
        }}
        onPointerDownEvent={(payload) => {
          recorderRef.current.recordPointerDown(payload);
          updateRecordedEventCount();
        }}
        onPointerUpEvent={(payload) => {
          recorderRef.current.recordPointerUp(payload);
          updateRecordedEventCount();
        }}
      />
    </main>
  );
}

export default App;
