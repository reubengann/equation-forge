import type { CompiledExprIndex as ExprIndex } from "@physics-derivation-pad/core/ast";
import type { RectBounds } from "./selectionController";
import type { TermSelection } from "@physics-derivation-pad/core/selection";

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

function normalizeMarqueeNodeToContainerChild(
  nodeId: string,
  containerNodeId: string,
  index: ExprIndex,
): string | null {
  let cursor = nodeId;
  while (true) {
    const parentId = index.parentById[cursor];
    if (!parentId) return null;
    if (parentId === containerNodeId) return cursor;

    // Forgive selecting part of a direct term like `a` in `2a`, but do not cross
    // nested sum/product boundaries like `b` inside `(a+b)c`.
    if (index.parentById[parentId] === containerNodeId) return parentId;

    const parent = index.nodeById[parentId];
    if (parent.kind === "add" || parent.kind === "multiply") return null;
    cursor = parentId;
  }
}

function normalizeSelectedContainerChild(nodeId: string, index: ExprIndex): string {
  const expr = index.nodeById[nodeId];
  const [childId] = index.childrenById[nodeId] ?? [];
  const child = childId ? index.nodeById[childId] : null;
  return expr?.kind === "negate" && child?.kind === "multiply" ? childId : nodeId;
}

function compareByContainerIndex(a: string, b: string, index: ExprIndex): number {
  const aIndex = index.locationById[a]?.index;
  const bIndex = index.locationById[b]?.index;
  if (aIndex == null || bIndex == null) return 0;
  return aIndex - bIndex;
}

function compareContainerKindPriority(a: string, b: string, index: ExprIndex): number {
  const aKind = index.nodeById[a]?.kind;
  const bKind = index.nodeById[b]?.kind;
  if (aKind === bKind) return 0;
  if (aKind === "add") return -1;
  if (bKind === "add") return 1;
  return 0;
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

export function applyMarqueeSelectIntent(args: {
  nodeIds: string[];
  currentSelection: TermSelection | null;
  index: ExprIndex;
}): MultiSelectionDecision {
  const uniqueNodeIds = Array.from(new Set(args.nodeIds));
  const containersById = new Map<string, { selectedNodeIds: Set<string>; sourceNodeIds: Set<string> }>();
  const standaloneNodeIds = new Set<string>();

  for (const nodeId of uniqueNodeIds) {
    let foundContainer = false;
    let cursor: string | null = args.index.parentById[nodeId] ?? null;
    while (cursor) {
      const container = args.index.nodeById[cursor];
      if (container.kind === "add" || container.kind === "multiply") {
        const selectableNodeId = normalizeMarqueeNodeToContainerChild(nodeId, cursor, args.index);
        if (selectableNodeId) {
          const selectedNodeId = normalizeSelectedContainerChild(selectableNodeId, args.index);
          const entry =
            containersById.get(cursor) ?? { selectedNodeIds: new Set<string>(), sourceNodeIds: new Set<string>() };
          entry.selectedNodeIds.add(selectedNodeId);
          entry.sourceNodeIds.add(nodeId);
          containersById.set(cursor, entry);
          foundContainer = true;
        }
      }
      cursor = args.index.parentById[cursor] ?? null;
    }

    if (!foundContainer) {
      standaloneNodeIds.add(nodeId);
    }
  }

  const containerEntries = Array.from(containersById.entries());
  containerEntries.sort(
    ([a], [b]) => (args.index.ancestorsById[b]?.length ?? 0) - (args.index.ancestorsById[a]?.length ?? 0),
  );
  const cleanMultiContainerEntries = containerEntries.filter(
    ([_, entry]) => entry.selectedNodeIds.size > 1 && entry.selectedNodeIds.size === entry.sourceNodeIds.size,
  );
  const completeContainerEntries = containerEntries.filter(
    ([_, entry]) => entry.sourceNodeIds.size === uniqueNodeIds.length,
  );
  const multiContainerEntries = containerEntries.filter(
    ([_, entry]) => entry.selectedNodeIds.size > 1,
  );
  multiContainerEntries.sort((a, b) => {
    const kindPriorityDelta = compareContainerKindPriority(a[0], b[0], args.index);
    if (kindPriorityDelta !== 0) return kindPriorityDelta;
    const selectedCountDelta = b[1].selectedNodeIds.size - a[1].selectedNodeIds.size;
    if (selectedCountDelta !== 0) return selectedCountDelta;
    return (args.index.ancestorsById[a[0]]?.length ?? 0) - (args.index.ancestorsById[b[0]]?.length ?? 0);
  });

  const chosenContainerEntry =
    uniqueNodeIds.length === 1
      ? completeContainerEntries[0]
      : (completeContainerEntries[0] ??
        multiContainerEntries[0] ??
        cleanMultiContainerEntries[0] ??
        completeContainerEntries[completeContainerEntries.length - 1]);
  const totalSelectionGroups = (chosenContainerEntry ? 1 : 0) + standaloneNodeIds.size;
  if (totalSelectionGroups !== 1) {
    return {
      accepted: false,
      nextSelection: args.currentSelection,
      ruleId: null,
      reason:
        totalSelectionGroups === 0 && uniqueNodeIds.length === 0
          ? "no_marquee_selectable_nodes"
          : "mixed_marquee_containers",
    };
  }

  if (standaloneNodeIds.size === 1 && containerEntries.length === 0) {
    const [nodeId] = Array.from(standaloneNodeIds);
    return {
      accepted: true,
      nextSelection: { kind: "single", nodeId },
      ruleId: "marquee_select_single",
      reason: "marquee selected one node",
    };
  }

  if (!chosenContainerEntry) {
    return {
      accepted: false,
      nextSelection: args.currentSelection,
      ruleId: null,
      reason: "mixed_marquee_containers",
    };
  }

  const [containerNodeId, { selectedNodeIds: selectedNodeIdSet }] = chosenContainerEntry;
  const selectedNodeIds = Array.from(selectedNodeIdSet).sort((a, b) =>
    compareByContainerIndex(a, b, args.index),
  );

  if (selectedNodeIds.length === 1) {
    return {
      accepted: true,
      nextSelection: { kind: "single", nodeId: selectedNodeIds[0] },
      ruleId: "marquee_select_single",
      reason: "marquee selected one node",
    };
  }

  return {
    accepted: true,
    nextSelection: {
      kind: "multi",
      nodeIds: selectedNodeIds,
      containerNodeId,
    },
    ruleId: "marquee_select_multi",
    reason: "marquee selected sibling terms in one sum/product",
  };
}

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
