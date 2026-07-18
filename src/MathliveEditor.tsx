import type { Ref, RefObject } from "react";
import { MathEntry, type EquationEntryCommands } from "./MathEntry";

type MathliveEditorProps = {
  slotRef: RefObject<HTMLDivElement | null>;
  latex: string;
  updateMathFieldValue: (nextLatex: string) => void;
  onAccept: (latestLatex?: string) => void;
  autoFocus?: boolean;
  focusAtEnd?: boolean;
  focusSession?: number;
  mathFieldId?: string;
  entryCommandRef?: Ref<EquationEntryCommands>;
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
  entryCommandRef,
}: MathliveEditorProps) {
  return (
    <MathEntry
      ref={entryCommandRef}
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
