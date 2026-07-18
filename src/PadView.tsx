import { useState } from "react";
import { DerivationPad, type DerivationPadOptions } from "./DerivationPad";
import {
  loadBrowserPadDocument,
  loadBrowserWrapEquationCopiesInDisplayMath,
  saveBrowserPadEquations,
  saveBrowserWrapEquationCopiesInDisplayMath,
} from "./pad/browserPadStorage";

export function PadView() {
  const [equations, setEquations] = useState(() => loadBrowserPadDocument().equations);
  const [activeEquationId, setActiveEquationId] = useState<string | null>(() => equations[0]?.id ?? null);
  const [options, setOptions] = useState<DerivationPadOptions>(() => ({
    wrapEquationCopiesInDisplayMath: loadBrowserWrapEquationCopiesInDisplayMath(),
  }));

  return (
    <DerivationPad
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
        saveBrowserWrapEquationCopiesInDisplayMath(nextOptions.wrapEquationCopiesInDisplayMath);
      }}
    />
  );
}
