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

export const MATH_ENTRY_MACROS: MathEntryMacro[] = [
  {
    id: "derivative",
    label: "d/d",
    title: "Insert derivative",
    latex: String.raw`\dfrac{\mathrm{d}{}\placeholder{}}{\mathrm{d}{}\placeholder{}}`,
    icon: (
      <svg {...iconProps}>
        <text x="3" y="15" fill="currentColor" fontSize="8" fontWeight="600">
          d/d
        </text>
      </svg>
    ),
  },
  {
    id: "derivative-operator",
    label: "d/d operator",
    title: "Insert derivative operator",
    latex: String.raw`\dfrac{\mathrm{d}}{\mathrm{d}{}\placeholder{}}`,
    icon: (
      <svg {...iconProps}>
        <text x="2" y="15" fill="currentColor" fontSize="8" fontWeight="600">
          d/du
        </text>
      </svg>
    ),
  },
  {
    id: "partial-derivative",
    label: "partial",
    title: "Insert partial derivative",
    latex: String.raw`\dfrac{\partial \placeholder{}}{\partial \placeholder{}}`,
    icon: (
      <svg {...iconProps}>
        <text x="2" y="15" fill="currentColor" fontSize="8" fontWeight="600">
          ∂/∂
        </text>
      </svg>
    ),
  },
  {
    id: "definite-integral",
    label: "integral",
    title: "Insert definite integral",
    latex: String.raw`\int_{\placeholder{}}^{\placeholder{}} \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: (
      <svg {...iconProps}>
        <text x="5" y="17" fill="currentColor" fontSize="18" fontWeight="500">
          ∫
        </text>
      </svg>
    ),
  },
  {
    id: "indefinite-integral",
    label: "integral dx",
    title: "Insert indefinite integral",
    latex: String.raw`\int \placeholder{}\,\mathrm{d}{}\placeholder{}`,
    icon: (
      <svg {...iconProps}>
        <text x="2" y="15" fill="currentColor" fontSize="8" fontWeight="600">
          ∫dx
        </text>
      </svg>
    ),
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
