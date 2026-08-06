import {
  createDefaultPadDocument,
  parseStoredPadState,
  serializePadDocument,
  type PadDocument,
  type PadEquation,
} from "./padDocument";
import type { EquationForgeOptions } from "../EquationForge";
import type { EquationCopySurroundMode } from "../copyLatex";

const STORAGE_KEY = "equation-forge-equations";
const COPY_OPTIONS_STORAGE_KEY = "equation-forge-copy-options";
const OPTIONS_STORAGE_KEY = "equation-forge-options";

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

function isCopySurroundMode(value: unknown): value is EquationCopySurroundMode {
  return value === "none" || value === "display-math" || value === "equation-environment";
}

export function loadBrowserEquationForgeOptions(): EquationForgeOptions {
  const defaults: EquationForgeOptions = {
    copySurroundMode: "none",
    showEquationNumbers: true,
  };
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Partial<EquationForgeOptions>;
      return {
        copySurroundMode: isCopySurroundMode(value.copySurroundMode)
          ? value.copySurroundMode
          : defaults.copySurroundMode,
        showEquationNumbers:
          typeof value.showEquationNumbers === "boolean" ? value.showEquationNumbers : defaults.showEquationNumbers,
      };
    }

    return {
      ...defaults,
      copySurroundMode:
        window.localStorage.getItem(COPY_OPTIONS_STORAGE_KEY) === "true" ? "display-math" : "none",
    };
  } catch {
    return defaults;
  }
}

export function saveBrowserEquationForgeOptions(value: EquationForgeOptions) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Copying still works if the browser blocks localStorage.
  }
}
