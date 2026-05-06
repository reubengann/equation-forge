import type { TermSelection } from "../../selection/types";
import type { CompiledMathDocument } from "../compile/compileMathDocument";

type Rule = {
  moveType: MoveType;
};

const RULES: Rule[] = [];

type MoveType = "additive" | "multiplicative";

export class RulesPipeline {
  document: CompiledMathDocument;
  execute: boolean;
  rules: Rule[];
  selection: TermSelection;
  destinationId: string;
  moveType: string;

  constructor(
    document: CompiledMathDocument,
    rules: Rule[] | null,
    selection: TermSelection,
    destinationId: string,
    moveType: MoveType,
  ) {
    this.document = document;
    this.rules = rules ?? RULES;
    this.selection = selection;
    this.destinationId = destinationId;
    this.moveType = moveType;
  }

  // If returns true, shouldn't we also return the insertion point?
  canMove(): boolean {
    return this.runEngine(false);
  }

  executeMove(): boolean {
    return this.runEngine(true);
  }

  private runEngine(shouldExecute: boolean): boolean {
    // Probably we should cache this/compile it into a constant map.
    const applicableRules = this.rules.filter((rule) => rule.moveType === this.moveType);
    // Find the route from the selection to the destination.
    // For each step in the rule, we have to check some stuff
    // While we're going up or down, check whether we have rules that can take us between nodes
    // It should be sufficient to check whether a rule covers a transition from a node type to another and whether it's additive or multiplicative
    // Note that some node types are wildcards, though. Any type can be moved out of an add node, for instance, as long as it's additive.
    // At the top of the tree, we may have to execute a pivot (e.g. an equality)
    if (this.selection.kind === "single" && this.selection.nodeId === this.destinationId) {
      // no op
      return false;
    }
    return false;
  }
}

/* 
    At some point we need to resolve an actual concrete destination inferred from the destinationId.

    Return null if there's no insertion point. Otherwise, we need to return an actual insertion point somehow.
    Later we will need to render the insertion point as an indicator. This will be done somewhere else.

    How will we save the state? If we follow different logic paths, they can diverge. But if we follow
    the same path, we should not be doing all the work to actually modify the tree. Perhaps we have
    two entry points, canMove and executeMove, and then the rewriteEngine calls one with a boolean that indicates
    to skip the actual extraction.
    
*/
export function canExecuteMove({
  document,
  selection,
  destinationId,
  moveType,
}: {
  document: CompiledMathDocument;
  selection: TermSelection;
  destinationId: string;
  moveType: MoveType;
}): boolean {
  return new RulesPipeline(document, RULES, selection, destinationId, moveType).canMove();
}
