import type { Expr } from "../../ast/expr";
import type { CompiledMathDocument } from "../../compile/compileMathDocument";
import { structuralKeyIgnoringDisplayGroups } from "../algebraUtils";
import type { TermSelection } from "../../selection";

export type PowerContainer = Extract<Expr, { kind: "power" | "root" }>;

export type PowerContainerLocation = {
  id: string;
  node: PowerContainer;
  innerId: string;
};

export function powerContainerAt(
  document: CompiledMathDocument,
  containerId: string,
): PowerContainerLocation | null {
  const node = document.index.nodeById[containerId];
  if (!node || (node.kind !== "power" && node.kind !== "root")) return null;
  const innerId = document.index.childrenById[containerId]?.[0];
  return innerId ? { id: containerId, node, innerId } : null;
}

export function enclosingPowerContainer(
  document: CompiledMathDocument,
  nodeId: string,
): PowerContainerLocation | null {
  let currentId: string | null = nodeId;
  while (currentId) {
    const candidate = powerContainerAt(document, currentId);
    if (candidate) {
      if (nodeId === candidate.innerId || document.index.ancestorsById[nodeId]?.includes(candidate.innerId)) {
        return candidate;
      }
      return null;
    }
    currentId = document.index.parentById[currentId];
  }
  return null;
}

export function sourcePowerContainer(
  document: CompiledMathDocument,
  selection: TermSelection,
): PowerContainerLocation | null {
  const anchorId = selection.kind === "single" ? selection.nodeId : selection.containerNodeId;
  if (!anchorId) return null;
  return enclosingPowerContainer(document, anchorId);
}

export function areMatchingPowerContainers(left: PowerContainer, right: PowerContainer): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "root" && right.kind === "root") return left.degree === right.degree;
  if (left.kind === "power" && right.kind === "power") {
    return (
      structuralKeyIgnoringDisplayGroups(left.exponent) ===
      structuralKeyIgnoringDisplayGroups(right.exponent)
    );
  }
  return false;
}
