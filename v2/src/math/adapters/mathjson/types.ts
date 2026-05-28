export type MathJsonRecord = Record<string, unknown>;

export type MathJsonValue =
  | null
  | boolean
  | number
  | string
  | MathJsonRecord
  | MathJsonValue[];

export type MathJsonTranslationIssue = {
  reason: string;
  exprKind?: string;
  detail?: string;
};
