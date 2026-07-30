import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UI_ICON_SVG, type UiIconName } from "./generatedUiIconSvg";
import { UiIcon } from "./UiIcon";

describe("UiIcon", () => {
  it("renders every selected icon as inline SVG", () => {
    Object.keys(UI_ICON_SVG).forEach((name) => {
      const markup = renderToStaticMarkup(
        <UiIcon name={name as UiIconName} />,
      );
      expect(markup).toContain("<svg");
      expect(markup).toContain('fill="currentColor"');
      expect(markup).toContain("width:100%;height:100%;display:block");
    });
  });
});
