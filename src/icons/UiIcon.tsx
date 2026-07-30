import type { CSSProperties } from "react";
import {
  UI_ICON_SVG,
  type UiIconName,
} from "./generatedUiIconSvg";

export type { UiIconName };

export type UiIconProps = {
  name: UiIconName;
  size?: number;
  style?: CSSProperties;
};

export function UiIcon({ name, size = 22, style }: UiIconProps) {
  const svg = UI_ICON_SVG[name]
    .replace(
      "<svg",
      '<svg style="width:100%;height:100%;display:block" fill="currentColor" focusable="false"',
    )
    .replace('fill="#000000"', 'fill="currentColor"');

  return (
    <span
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        overflow: "hidden",
        verticalAlign: "middle",
        lineHeight: 0,
        ...style,
      }}
    />
  );
}
