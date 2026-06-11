import type { RefObject } from "react";
import { MathEntry } from "./MathEntry";

type MathliveEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  latex: string;
  updateMathFieldValue: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  autoFocus?: boolean;
  focusAtEnd?: boolean;
  focusSession?: number;
  mathFieldId?: string;
};

export function MathliveEditor({
  slotRef,
  latex,
  updateMathFieldValue,
  onAccept,
  autoFocus,
  focusAtEnd,
  focusSession,
  mathFieldId,
}: MathliveEditorProps) {
  return (
    <MathEntry
      slotRef={slotRef}
      latex={latex}
      onLatexChange={updateMathFieldValue}
      onAccept={onAccept}
      autoFocus={autoFocus}
      focusAtEnd={focusAtEnd}
      focusSession={focusSession}
      mathFieldId={mathFieldId}
    />
  );
}
