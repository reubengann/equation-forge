import { useState } from "react";
import { EquationForge, type EquationForgeOptions } from "./EquationForge";
import {
  loadBrowserEquationForgeOptions,
  loadBrowserPadDocument,
  saveBrowserEquationForgeOptions,
  saveBrowserPadEquations,
} from "./pad/browserPadStorage";

export function PadView() {
  const [equations, setEquations] = useState(() => loadBrowserPadDocument().equations);
  const [activeEquationId, setActiveEquationId] = useState<string | null>(() => equations[0]?.id ?? null);
  const [options, setOptions] = useState<EquationForgeOptions>(loadBrowserEquationForgeOptions);

  return (
    <EquationForge
      equations={equations}
      activeEquationId={activeEquationId}
      options={options}
      description="Equations persist locally. Click an equation to make its shortcuts active."
      onEquationsChange={(nextEquations) => {
        setEquations(nextEquations);
        saveBrowserPadEquations(nextEquations);
      }}
      onActiveEquationIdChange={setActiveEquationId}
      onOptionsChange={(nextOptions) => {
        setOptions(nextOptions);
        saveBrowserEquationForgeOptions(nextOptions);
      }}
    />
  );
}
