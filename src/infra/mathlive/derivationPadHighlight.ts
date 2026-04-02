import { getMathliveShadowRoot } from "./mathliveShadow";

/**
 * Injects our shadow DOM styling into a MathLive host element, once.
 * Keeps click targets enabled only on our tagged node elements and
 * toggles selection/dragging colors.
 */
export function installShadowStyle(mathDivEl: HTMLElement) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  if (sr.querySelector("style[data-derivation-pad]")) return;

  const style = document.createElement("style");
  style.setAttribute("data-derivation-pad", "1");
  style.textContent = `

  /* Any element whose class includes ML__vlist and any descendant.
     Disable clicks on Mathlive's fraction layout scaffolding */
  .ML__vlist {
    pointer-events: none !important;
  }

  [data-node-id] [data-node-id] {
    pointer-events: auto !important;
  }

  /* But still allow clicks on our tagged nodes (and their descendants) */
  [data-fn-arg]:not(.dp-selected) { color: var(--dp-muted, #9aa0a6); }
  .dp-selected { color: #ff9800;}
  .dp-faded { opacity: 0.25; }
  .dp-dragging { color: #7c4dff; font-weight: 600; }
  `;
  sr.appendChild(style);
}

/**
 * Adds or clears highlighted nodes inside the MathLive shadow DOM.
 */
export function setHighlightedText(
  mathDivEl: HTMLElement,
  nodeIds?: string[] | null
) {
  const sr = getMathliveShadowRoot(mathDivEl);
  if (!sr) return;

  sr.querySelectorAll(".dp-selected").forEach((el) =>
    el.classList.remove("dp-selected")
  );

  const ids = nodeIds ?? [];
  for (const id of ids) {
    sr.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`).forEach(
      (el) => el.classList.add("dp-selected")
    );
  }
}
