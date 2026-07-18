import type { ReactNode } from "react";
import derivativeIconSvg from "../../public/icons/derivative.svg?raw";
import derivativeOperatorIconSvg from "../../public/icons/derivative-operator.svg?raw";
import definiteIntegralIconSvg from "../../public/icons/definite-integral.svg?raw";
import indefiniteIntegralIconSvg from "../../public/icons/indefinite-integral.svg?raw";
import partialDerivativeIconSvg from "../../public/icons/partial-derivative.svg?raw";
import partialDerivativeOperatorIconSvg from "../../public/icons/partial-derivative-operator.svg?raw";
import partialDerivativeSubscriptIconSvg from "../../public/icons/partial-derivative-subscript.svg?raw";

export type MathEntryMacro = {
  id: string;
  label: string;
  title: string;
  latex: string;
  icon: ReactNode;
};

function macroIcon(svg: string, size = 22) {
  const sizedSvg = svg.replace("<svg", '<svg style="width:100%;height:100%;display:block" focusable="false"');
  return (
    <span
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: sizedSvg }}
      style={{
        width: size,
        height: size,
        display: "block",
        filter: "invert(1)",
        lineHeight: 0,
        overflow: "hidden",
      }}
    />
  );
}

const fractionMacroIconSize = 34;

export const MATH_ENTRY_MACROS: MathEntryMacro[] = [
  {
    id: "derivative",
    label: "d/d",
    title: "Insert derivative",
    latex: String.raw`\dfrac{\mathrm{d}{}\placeholder{}}{\mathrm{d}{}\placeholder{}}`,
    icon: macroIcon(derivativeIconSvg, fractionMacroIconSize),
  },
  {
    id: "derivative-operator",
    label: "d/d operator",
    title: "Insert derivative operator",
    latex: String.raw`\dfrac{\mathrm{d}}{\mathrm{d}{}\placeholder{}}`,
    icon: macroIcon(derivativeOperatorIconSvg, fractionMacroIconSize),
  },
  {
    id: "partial-derivative",
    label: "partial",
    title: "Insert partial derivative",
    latex: String.raw`\dfrac{\partial \placeholder{}}{\partial \placeholder{}}`,
    icon: macroIcon(partialDerivativeIconSvg, fractionMacroIconSize),
  },
  {
    id: "partial-derivative-operator",
    label: "partial operator",
    title: "Insert partial derivative operator",
    latex: String.raw`\dfrac{\partial}{\partial \placeholder{}}`,
    icon: macroIcon(partialDerivativeOperatorIconSvg, fractionMacroIconSize),
  },
  {
    id: "partial-derivative-subscript",
    label: "partial subscript",
    title: "Insert parenthesized partial derivative with subscript",
    latex: String.raw`\left(\dfrac{\partial \placeholder{}}{\partial \placeholder{}}\right)_{\placeholder{}}`,
    icon: macroIcon(partialDerivativeSubscriptIconSvg, 36),
  },
  {
    id: "definite-integral",
    label: "integral",
    title: "Insert definite integral",
    latex: String.raw`\int_{\placeholder{}}^{\placeholder{}} \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon(definiteIntegralIconSvg, 22),
  },
  {
    id: "indefinite-integral",
    label: "integral dx",
    title: "Insert indefinite integral",
    latex: String.raw`\int \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon(indefiniteIntegralIconSvg, 20),
  },
  {
    id: "parentheses",
    label: "parentheses",
    title: "Insert parentheses",
    latex: String.raw`\left(\placeholder{}\right)`,
    icon: (
      <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
        <text x="5" y="15" fill="currentColor" fontSize="12" fontWeight="600">
          ( )
        </text>
      </svg>
    ),
  },
];
