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
      alt=""
      aria-hidden="true"
      style={{ filter: "invert(1)", display: "block" }}
    />
  );
}

const fractionMacroIconSize = 44;

export const MATH_ENTRY_MACROS: MathEntryMacro[] = [
  {
    id: "derivative",
    label: "d/d",
    title: "Insert derivative",
    latex: String.raw`\dfrac{\mathrm{d}{}\placeholder{}}{\mathrm{d}{}\placeholder{}}`,
    icon: macroIcon("/icons/macro01.svg", fractionMacroIconSize),
  },
  {
    id: "derivative-operator",
    label: "d/d operator",
    title: "Insert derivative operator",
    latex: String.raw`\dfrac{\mathrm{d}}{\mathrm{d}{}\placeholder{}}`,
    icon: macroIcon("/icons/macro02.svg", fractionMacroIconSize),
  },
  {
    id: "partial-derivative",
    label: "partial",
    title: "Insert partial derivative",
    latex: String.raw`\dfrac{\partial \placeholder{}}{\partial \placeholder{}}`,
    icon: macroIcon("/icons/macro03.svg", fractionMacroIconSize),
  },
  {
    id: "definite-integral",
    label: "integral",
    title: "Insert definite integral",
    latex: String.raw`\int_{\placeholder{}}^{\placeholder{}} \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon("/icons/macro04.svg", 22),
  },
  {
    id: "indefinite-integral",
    label: "integral dx",
    title: "Insert indefinite integral",
    latex: String.raw`\int \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: macroIcon("/icons/macro05.svg", 20),
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
