import type { TermSelection } from "@physics-derivation-pad/core/selection";
import type {
  InsertionPreview,
  MoveType,
} from "@physics-derivation-pad/core/rewrite";
import type {
  DomSnapshotObservedPayload,
  PointerEventPayload,
} from "./interaction/selectionController";

export type EquationEditorRecordingHooks = {
  onDomSnapshotObserved: (payload: DomSnapshotObservedPayload) => void;
  onPointerDownEvent: (payload: PointerEventPayload) => void;
  onPointerMoveEvent: (payload: PointerEventPayload) => void;
  onPointerUpEvent: (payload: PointerEventPayload) => void;
  onSelectionChanged: (selection: TermSelection | null) => void;
  onPreviewChanged: (preview: InsertionPreview | null) => void;
  onMoveTypeChanged: (moveType: MoveType) => void;
};
