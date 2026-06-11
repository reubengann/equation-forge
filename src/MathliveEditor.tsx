import type { RefObject } from "react";
import { MathEntry } from "./MathEntry";

type MathliveEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  latex: string;
  updateMathFieldValue: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  mathFieldId?: string;
};

export function MathliveEditor({
  slotRef,
  latex,
  updateMathFieldValue,
  onAccept,
  mathFieldId,
}: MathliveEditorProps) {
  return (
    <MathEntry
      slotRef={slotRef}
      latex={latex}
      onLatexChange={updateMathFieldValue}
      onAccept={onAccept}
      mathFieldId={mathFieldId}
    />
  );
}
