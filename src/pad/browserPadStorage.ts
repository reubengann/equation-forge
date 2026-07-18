import {
  createDefaultPadDocument,
  parseStoredPadState,
  serializePadDocument,
  type PadDocument,
  type PadEquation,
} from "./padDocument";

const STORAGE_KEY = "physics-derivation-pad-equations";
const COPY_OPTIONS_STORAGE_KEY = "physics-derivation-pad-copy-options";

export function loadBrowserPadDocument(): PadDocument {
  if (typeof window === "undefined") return createDefaultPadDocument();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultPadDocument();
    return parseStoredPadState(JSON.parse(raw));
  } catch {
    return createDefaultPadDocument();
  }
}

export function saveBrowserPadEquations(equations: PadEquation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializePadDocument({ equations })));
}

export function loadBrowserWrapEquationCopiesInDisplayMath(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(COPY_OPTIONS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveBrowserWrapEquationCopiesInDisplayMath(value: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(COPY_OPTIONS_STORAGE_KEY, String(value));
  } catch {
    // Copying still works if the browser blocks localStorage.
  }
}
