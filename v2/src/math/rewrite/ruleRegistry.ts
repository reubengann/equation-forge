import { extractFactorFromProduct } from "./rules/extractFactorFromProduct";
import { extractThroughDisplayGroup } from "./rules/extractThroughDisplayGroup";
import { extractDenominatorFactorFromFraction } from "./rules/extractDenominatorFactorFromFraction";
import { extractNumeratorFromFraction } from "./rules/extractNumeratorFromFraction";
import { extractTermFromSum } from "./rules/extractTermFromSum";
import { insertFactorIntoDenominator } from "./rules/insertFactorIntoDenominator";
import { insertFactorIntoProduct } from "./rules/insertFactorIntoProduct";
import { insertTermIntoSum } from "./rules/insertTermIntoSum";
import { pivotAdditiveAcrossEquation } from "./rules/pivotAdditiveAcrossEquation";
import { pivotMultiplicativeAcrossEquation } from "./rules/pivotMultiplicativeAcrossEquation";
import { pivotMultiplicativeWithinProduct } from "./rules/pivotMultiplicativeWithinProduct";
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
  extractDenominatorFactorFromFraction(),
  extractFactorFromProduct(),
  extractThroughDisplayGroup(),
];

export const PIVOT_REWRITE_RULES: PivotRewriteRule[] = [
  pivotAdditiveAcrossEquation(),
  pivotMultiplicativeAcrossEquation(),
  pivotMultiplicativeWithinProduct(),
];

export const DOWNWARD_REWRITE_RULES: DownwardRewriteRule[] = [
  insertTermIntoSum(),
  insertFactorIntoDenominator(),
  insertFactorIntoProduct(),
];
