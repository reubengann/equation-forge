import type { ReactNode } from "react";

export type MathEntryMacro = {
  id: string;
  label: string;
  title: string;
  latex: string;
  icon: ReactNode;
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
} as const;

function macroIcon(src: string, size = 22) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      alt=""
      aria-hidden="true"
      style={{ filter: "invert(1)", display: "block" }}
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
    icon: macroIcon("/icons/derivative.svg", fractionMacroIconSize),
  },
  {
    id: "derivative-operator",
    label: "d/d operator",
    title: "Insert derivative operator",
    latex: String.raw`\dfrac{\mathrm{d}}{\mathrm{d}{}\placeholder{}}`,
    icon: macroIcon("/icons/derivative-operator.svg", fractionMacroIconSize),
  },
  {
    id: "partial-derivative",
    label: "partial",
    title: "Insert partial derivative",
    latex: String.raw`\dfrac{\partial \placeholder{}}{\partial \placeholder{}}`,
    icon: macroIcon("/icons/partial-derivative.svg", fractionMacroIconSize),
  },
  {
    id: "partial-derivative-operator",
    label: "partial operator",
    title: "Insert partial derivative operator",
    latex: String.raw`\dfrac{\partial}{\partial \placeholder{}}`,
    icon: macroIcon("/icons/partial-derivative-operator.svg", fractionMacroIconSize),
  },
  {
    id: "partial-derivative-subscript",
    label: "partial subscript",
    title: "Insert parenthesized partial derivative with subscript",
    latex: String.raw`\left(\dfrac{\partial \placeholder{}}{\partial \placeholder{}}\right)_{\placeholder{}}`,
    icon: macroIcon("/icons/partial-derivative-subscript.svg", 36),
  },
  {
    id: "definite-integral",
    label: "integral",
    title: "Insert definite integral",
    latex: String.raw`\int_{\placeholder{}}^{\placeholder{}} \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon("/icons/definite-integral.svg", 22),
  },
  {
    id: "indefinite-integral",
    label: "integral dx",
    title: "Insert indefinite integral",
    latex: String.raw`\int \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon("/icons/indefinite-integral.svg", 20),
  },
  {
    id: "parentheses",
    label: "parentheses",
    title: "Insert parentheses",
    latex: String.raw`\left(\placeholder{}\right)`,
    icon: (
      <svg {...iconProps}>
        <text x="5" y="15" fill="currentColor" fontSize="12" fontWeight="600">
          ( )
        </text>
      </svg>
    ),
  },
];
