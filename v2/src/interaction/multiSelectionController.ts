import type { CompiledExprIndex as ExprIndex } from "../math/ast";
import type { RectBounds } from "./selectionController";
import type { TermSelection } from "../selection/types";

export type MultiSelectionEvent =
  | { type: "ctrl_click"; nodeId: string }
  | { type: "tree_expand_click"; nodeId: string }
  | { type: "marquee_select"; nodeIds: string[]; marqueeRect: RectBounds };

export type MultiSelectionDecision = {
  accepted: boolean;
  nextSelection: TermSelection | null;
  ruleId: string | null;
  reason: string | null;
};

type MultiSelectionRule = {
  id: string;
  apply: (args: {
    nodeId: string;
    currentSelection: TermSelection | null;
    index: ExprIndex;
  }) => MultiSelectionDecision | null;
};

function walkUpToSelectableNode(nodeId: string, parentId: string, index: ExprIndex): string | null {
  // Walk up until we reach the direct child under the container parent.
  let cursor = nodeId;
  while (true) {
    const immediateParentId = index.parentById[cursor];
    if (!immediateParentId) return null;
    if (immediateParentId === parentId) return cursor;
    cursor = immediateParentId;
  }
}

function walkUpToSumOrProduct(nodeId: string, index: ExprIndex): string | null {
  let cursor = nodeId;
  while (cursor) {
    const parentId = index.parentById[cursor];
    if (!parentId) return null;
    const parent = index.nodeById[parentId];
    if (parent.kind == "add" || parent.kind == "multiply") {
      return parentId;
    }

    cursor = parentId;
  }
  return null;
}

// Input must be atomic/selectable. We don't check for that here.
const sumProductTermCtrlClickRule: MultiSelectionRule = {
  id: "add_terms_ctrl_click",
  // If we click on a selectable element, but not necessarily the term of the sum/product
  // we need to walk up to it. Example: if we have \frac{a}{b} + c, select c, and then ctrl
  // click on a, we should select the fraction and c, since those are indeed both part of the same sum.
  apply: ({ nodeId, currentSelection, index }): MultiSelectionDecision | null => {
    if (!currentSelection) return null;
    if (currentSelection.kind === "single") {
      // If the current selection is a single node and this is the same node, just de-select it.
      if (currentSelection.nodeId === nodeId) {
        return {
          accepted: true,
          nextSelection: null,
          ruleId: "de-select_single_node",
          reason: null,
        };
      }
      // We have to determine if the existing selection has any common sum/product parent.
      const sumOrProductOfExistingSelection = walkUpToSumOrProduct(currentSelection.nodeId, index);
      if (!sumOrProductOfExistingSelection) return null;
      const sumOrProductOfNewNode = walkUpToSumOrProduct(nodeId, index);
      if (!sumOrProductOfNewNode) return null;
      if (sumOrProductOfExistingSelection !== sumOrProductOfNewNode) return null;
      return {
        accepted: true,
        nextSelection: {
          kind: "multi",
          nodeIds: [currentSelection.nodeId, nodeId],
          containerNodeId: sumOrProductOfExistingSelection,
        },
        reason: "both nodes are part of the same sum/product",
        ruleId: "add_terms_ctrl_click",
      };
    } else {
      // multiselection
      const currentSelectedParent = currentSelection.containerNodeId;
      if (!currentSelectedParent) return null;
      const selectableNode = walkUpToSelectableNode(nodeId, currentSelectedParent, index);
      if (!selectableNode) return null;
      if (currentSelection.nodeIds.includes(selectableNode)) {
        // Deselect the node.
        // If there is only one node remaining, convert to single selection.
        if (currentSelection.nodeIds.length === 2) {
          const remainingNodeId = currentSelection.nodeIds.find((id) => id !== selectableNode);
          if (!remainingNodeId) return null;
          return {
            accepted: true,
            nextSelection: {
              kind: "single",
              nodeId: remainingNodeId,
            },
            ruleId: "convert_multi_to_single",
            reason: "only one node remaining",
          };
        }
        // Otherwise, just remove the node from the selection.
        return {
          accepted: true,
          nextSelection: {
            ...currentSelection,
            nodeIds: currentSelection.nodeIds.filter((id) => id !== selectableNode),
          },
          ruleId: "remove_node_from_multi_selection",
          reason: "node is already selected",
        };
      } else {
        // Add it to the selection
        return {
          accepted: true,
          nextSelection: {
            ...currentSelection,
            nodeIds: [...currentSelection.nodeIds, selectableNode],
          },
          ruleId: "add_node_to_multi_selection",
          reason: "node is not already selected",
        };
      }
    }
  },
};

const CTRL_CLICK_RULES: MultiSelectionRule[] = [sumProductTermCtrlClickRule];

export function applyCtrlClickIntent(args: {
  nodeId: string;
  currentSelection: TermSelection | null;
  index: ExprIndex;
}): MultiSelectionDecision {
  for (const rule of CTRL_CLICK_RULES) {
    const decision = rule.apply(args);
    if (decision) return decision;
  }
  return {
    accepted: false,
    nextSelection: args.currentSelection,
    ruleId: null,
    reason: "no_matching_ctrl_click_rule",
  };
}
