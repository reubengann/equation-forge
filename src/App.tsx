import { useState } from "react";
import "./App.css";
import { DebugPage } from "./pages/DebugPage";
import { DerivationPage } from "./pages/DerivationPage";
import { V2Page } from "./pages/V2Page";

type Page = "debug" | "derivation" | "v2";

export default function App() {
  const [page, setPage] = useState<Page>("derivation");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dp-surface)",
        color: "inherit",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--dp-border)",
          background: "var(--dp-surface)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
        }}
      >
        <button
          type="button"
          onClick={() => setPage("debug")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--dp-border)",
            background: page === "debug" ? "rgba(124,77,255,0.12)" : "var(--dp-surface)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Debug (single pad)
        </button>
        <button
          type="button"
          onClick={() => setPage("derivation")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--dp-border)",
            background:
              page === "derivation" ? "rgba(124,77,255,0.12)" : "var(--dp-surface)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Derivation (multi-pad)
        </button>
        <button
          type="button"
          onClick={() => setPage("v2")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--dp-border)",
            background: page === "v2" ? "rgba(124,77,255,0.12)" : "var(--dp-surface)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          V2 (isolated app)
        </button>
      </header>

      <main>
        {page === "debug" ? (
          <DebugPage />
        ) : page === "derivation" ? (
          <DerivationPage />
        ) : (
          <V2Page />
        )}
      </main>
    </div>
  );
}
