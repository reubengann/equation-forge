import { extractFactorFromProduct } from "./rules/extractFactorFromProduct";
import { extractFactorFromMatchingPower } from "./rules/extractFactorFromMatchingPower";
import { extractFactorFromDerivative } from "./rules/extractFactorFromDerivative";
import { extractFactorFromDifferential } from "./rules/extractFactorFromDifferential";
import { extractFactorFromIntegral } from "./rules/extractFactorFromIntegral";
import { extractThroughDisplayGroup } from "./rules/extractThroughDisplayGroup";
import { extractDenominatorFactorFromFraction } from "./rules/extractDenominatorFactorFromFraction";
import { extractNumeratorTermFromFraction } from "./rules/extractNumeratorTermFromFraction";
import { extractNumeratorFromFraction } from "./rules/extractNumeratorFromFraction";
import { extractTermFromSum } from "./rules/extractTermFromSum";
import { insertFactorIntoDenominator } from "./rules/insertFactorIntoDenominator";
import { insertFactorIntoMatchingPower } from "./rules/insertFactorIntoMatchingPower";
import { insertFactorIntoProduct } from "./rules/insertFactorIntoProduct";
import { insertTermIntoSum } from "./rules/insertTermIntoSum";
import { pivotAdditiveAcrossEquation } from "./rules/pivotAdditiveAcrossEquation";
import { pivotMultiplicativeAcrossEquation } from "./rules/pivotMultiplicativeAcrossEquation";
import { pivotMultiplicativeWithinProduct } from "./rules/pivotMultiplicativeWithinProduct";
import { rearrangeFactorsInProduct, rearrangeMultipleFactorsInProduct } from "./rules/rearrangeFactorsInProduct";
import { rearrangeTermsInSum } from "./rules/rearrangeTermsInSum";
import type { DownwardRewriteRule, PivotRewriteRule, SingleContainerRule, UpwardRewriteRule } from "./types";

export const SINGLE_CONTAINER_RULES: SingleContainerRule[] = [
  rearrangeTermsInSum(),
  rearrangeFactorsInProduct(),
  rearrangeMultipleFactorsInProduct(),
];

export const UPWARD_REWRITE_RULES: UpwardRewriteRule[] = [
  extractTermFromSum(),
  extractNumeratorTermFromFraction(),
  extractNumeratorFromFraction(),
  extractDenominatorFactorFromFraction(),
  extractFactorFromProduct(),
  extractFactorFromMatchingPower(),
  extractFactorFromDerivative(),
  extractFactorFromDifferential(),
  extractFactorFromIntegral(),
  extractThroughDisplayGroup(),
];

export const PIVOT_REWRITE_RULES: PivotRewriteRule[] = [
  pivotAdditiveAcrossEquation(),
  pivotMultiplicativeAcrossEquation(),
  pivotMultiplicativeWithinProduct(),
];

export const DOWNWARD_REWRITE_RULES: DownwardRewriteRule[] = [
  insertTermIntoSum(),
  insertFactorIntoMatchingPower(),
  insertFactorIntoDenominator(),
  insertFactorIntoProduct(),
];
