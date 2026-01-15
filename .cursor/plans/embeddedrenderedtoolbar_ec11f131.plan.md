---
name: EmbeddedRenderedToolbar
overview: Embed an icon-based toolbar inside the rendered output panel (always visible) and restructure the debug output into labeled fields, keeping only the expression tree as a multiline textbox.
todos:
  - id: embed-render-toolbar
    content: Move Add/Update + move-mode controls into a docked toolbar inside the rendered panel; remove old external button row; keep data-testid stable.
    status: pending
  - id: icon-toolbar-styles
    content: Introduce icon-only toolbar buttons (SVG) with accessible labels and theme-safe styling via App.css (imported in App.tsx).
    status: pending
  - id: split-debug-fields
    content: Split latex vs expression.json into separate labeled fields; keep expression tree as the only multiline textbox; present other debug outputs as labeled read-only fields.
    status: pending
  - id: stabilize-tests
    content: Run/update Playwright helpers if any selectors/assumptions changed (especially info-text/latex parsing).
    status: pending
---

## Scope

- Move all action buttons into the rendered output panel via a docked toolbar.
- Replace text buttons with icon buttons + tooltips and fix contrast in dark mode.
- Split the current “info” debug blob into labeled fields; keep the Expression Tree (MathJSON) as the only multiline textbox and keep it read-only.

## What exists today (anchors)

- Buttons currently live above the render box (move-mode + Add/Update):

```1054:1091:src/App.tsx
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 220,
            }}
          >
            <label style={{ fontSize: 12, opacity: 0.8 }}>Move mode</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["additive", "multiplicative"] as MoveMode[]).map((mode) => {
                const active = moveMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setMoveMode(mode)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: active ? "2px solid #7c4dff" : "1px solid #888",
                      background: active ? "rgba(124, 77, 255, 0.1)" : "#fff",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                    data-testid={`mode-${mode}`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={onAddEquation}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #888",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            data-testid="add-update"
          >
            Add / Update
          </button>
```

- Render box structure (we’ll add a header/toolbar here):

```1095:1168:src/App.tsx
      <div
        ref={renderBoxRef}
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          padding: 14,
          borderRadius: 10,
          cursor: drag ? "default" : "crosshair",
          userSelect: "none",
        }}
        onPointerDown={onDisplayPointerDown}
        onPointerMove={onDisplayPointerMove}
        onPointerUp={onDisplayPointerUp}
        onPointerCancel={onDisplayPointerUp}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div style={{ fontSize: 14, marginBottom: 8, opacity: 0.8 }}>
          Rendered (tagged from MathJSON) — click to inspect + highlight
        </div>

        <div
          ref={mathWrapRef}
          style={{ position: "relative", display: "inline-block" }}
        >
          <MathDiv
            ref={measureRef}
            mode="displaystyle"
            className="math-measure"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              pointerEvents: "none",
              fontSize: "1.2rem",
            }}
          />
          <div style={{ position: "relative" }}>
            <MathDiv
              ref={displayRef}
              mode="displaystyle"
              className="math-display"
              data-testid="math-display"
              style={{ fontSize: "1.2rem" }}
            />
            {/* Insert marker overlay */}
            <div ref={insertOverlayRef} style={{ /* ... */ }} />
            {/* Debug overlay */}
            <div ref={debugOverlayRef} style={{ /* ... */ }} />
          </div>
        </div>
      </div>
```

- Debug output is currently multiple textareas, but `info` is a combined “latex + expression.json” blob:

```425:433:src/App.tsx
  function setInfoFromTree(t: ExpressionTree, latex?: string) {
    const parts = [
      latex ? `LaTeX: ${latex}` : undefined,
      latex ? "" : undefined,
      "expression.json:",
      JSON.stringify(t.rootJson, null, 2),
    ].filter((x) => x !== undefined) as string[];
    setInfo(parts.join("\n"));
  }
```

## Planned changes

### 1) Docked toolbar inside rendered panel

- Update [`src/App.tsx`](src/App.tsx) to insert a header row inside the render box:
  - Left: a compact title (e.g. “Rendered”) and optional status text.
  - Right: a `.dp-toolbar` containing icon buttons:
    - **Update render** (calls existing `onAddEquation`) and keep `data-testid="add-update"`.
    - **Move mode** toggle as two icon buttons (additive/multiplicative) and keep `data-testid="mode-additive"` / `mode-multiplicative"`.
    - **Toggle debug boxes** button (toggles `debugBoxes`) while keeping the existing backtick hotkey.
- Remove the old button row above the render box so buttons exist only “within the rendered output.”

### 2) Icon-only buttons + proper styling (fix contrast)

- Add a small reusable `IconButton` (either inline in `App.tsx` or in a new file like [`src/ui/IconButton.tsx`](src/ui/IconButton.tsx)) that:
  - Uses `aria-label` + `title` for tooltip.
  - Supports `active` state (for move-mode toggles).
  - Uses `currentColor` SVG icons.
- Add/repurpose [`src/App.css`](src/App.css) (currently unused) and import it from `App.tsx`.
  - Define `.dp-toolbar`, `.dp-iconButton`, `.dp-iconButtonActive`, `.dp-renderBoxHeader`.
  - Ensure colors work in dark mode (current issue is `background: "#fff"` with inherited white text).
  - Keep Playwright selectors stable by preserving `data-testid`s.

### 3) Split debug outputs into labeled fields

- Replace the “latex + expression.json” concatenation in `setInfoFromTree` with separate state:
  - `latexText` (single-line, read-only input). Keep `data-testid="info-text"` on this field so existing Playwright helper continues to work.
  - `expressionJsonText` (multiline, read-only textarea) to be the “Expression Tree” box.
- Keep `info2`, `info3`, `infoArgs` but present them as labeled sections instead of unlabeled stacked boxes.
- Convert the four `<p>` debug lines (`dragStartInfo`, `dragHoverInfo`, `dragSlot`, `parentAddId`) into labeled read-only inputs in a compact grid.

### 4) Tests adjustments (only if needed)

- Most e2e tests should keep working since they locate buttons by `data-testid`.
- If we change `data-testid="info-text"` from textarea to input, `getRenderedLatex()` should still work unchanged; if not, update [`tests/helpers/dragMathlive.ts`](tests/helpers/dragMathlive.ts) to read the new field explicitly.

## Test plan

- `npm run dev` and verify:
  - Toolbar is inside the rendered box and buttons are legible in dark mode.
  - “Update render” works and the move mode toggles remain clickable.
  - Debug boxes toggle works via toolbar and backtick hotkey.
  - Debug panel shows separate labeled fields; expression tree is the only multiline textbox.
- `npm run test` and `npm run test:e2e` to ensure selector stability.
