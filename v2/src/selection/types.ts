type SingleSelection = {
  kind: "single";
  nodeId: string;
};
type MultiSelection = {
  kind: "multi";
  nodeIds: string[];
  containerNodeId: string | null;
};

export type TermSelection = SingleSelection | MultiSelection;
