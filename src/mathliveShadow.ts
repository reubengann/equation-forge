export function getMathliveShadowRoot(mathDivEl: HTMLElement) {
  return (mathDivEl as any).shadowRoot as ShadowRoot | null;
}
