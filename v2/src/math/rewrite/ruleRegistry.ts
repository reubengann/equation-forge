import { extractFactorFromProduct } from "./rules/extractFactorFromProduct";
import { extractNumeratorFromFraction } from "./rules/extractNumeratorFromFraction";
import { extractTermFromSum } from "./rules/extractTermFromSum";
import { insertFactorIntoDenominator } from "./rules/insertFactorIntoDenominator";
import { insertTermIntoSum } from "./rules/insertTermIntoSum";
import { pivotAdditiveAcrossEquation } from "./rules/pivotAdditiveAcrossEquation";
import { pivotMultiplicativeAcrossEquation } from "./rules/pivotMultiplicativeAcrossEquation";
import { rearrangeFactorsInProduct } from "./rules/rearrangeFactorsInProduct";
import { rearrangeTermsInSum } from "./rules/rearrangeTermsInSum";
import type { DownwardRewriteRule, PivotRewriteRule, SingleContainerRule, UpwardRewriteRule } from "./types";

export const SINGLE_CONTAINER_RULES: SingleContainerRule[] = [
  rearrangeTermsInSum(),
  rearrangeFactorsInProduct(),
];

export const UPWARD_REWRITE_RULES: UpwardRewriteRule[] = [
  extractTermFromSum(),
  extractNumeratorFromFraction(),
  extractFactorFromProduct(),
];

export const PIVOT_REWRITE_RULES: PivotRewriteRule[] = [
  pivotAdditiveAcrossEquation(),
  pivotMultiplicativeAcrossEquation(),
];

export const DOWNWARD_REWRITE_RULES: DownwardRewriteRule[] = [
  insertTermIntoSum(),
  insertFactorIntoDenominator(),
];
