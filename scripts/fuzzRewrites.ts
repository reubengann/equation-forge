import * as fc from "fast-check";
import {
  formatRewriteFuzzFailure,
  rewriteFuzzCaseArbitrary,
  runRewriteFuzzCase,
} from "../src/math/rewrite/rewriteFuzz";

type FuzzOptions = {
  seed: number;
  numRuns: number;
};

const DEFAULT_OPTIONS: FuzzOptions = {
  seed: 20260702,
  numRuns: 1_000,
};

function parseArgs(args: string[]): FuzzOptions {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--seed") {
      options.seed = parseNumberArg("--seed", args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--numRuns" || arg === "--runs") {
      options.numRuns = parseNumberArg(arg, args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseNumberArg(name: string, value: string | undefined): number {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) throw new Error(`${name} expects an integer value.`);
  return parsed;
}

function printUsage(): void {
  console.log("Usage: npm run fuzz:rewrites -- [--seed 123] [--numRuns 1000]");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  let checkedMoves = 0;
  let skippedCases = 0;

  console.log(`Rewrite fuzz: seed=${options.seed}, numRuns=${options.numRuns}`);

  fc.assert(
    fc.property(rewriteFuzzCaseArbitrary, (testCase) => {
      const result = runRewriteFuzzCase(testCase);
      checkedMoves += result.checkedMoves;
      if (result.skipped) skippedCases += 1;
      if (result.failure) throw new Error(formatRewriteFuzzFailure(result.failure));
    }),
    {
      seed: options.seed,
      numRuns: options.numRuns,
    },
  );

  console.log(`PASS rewrite fuzz: checked ${checkedMoves} accepted moves across ${options.numRuns} cases.`);
  if (skippedCases > 0) {
    console.log(`Skipped ${skippedCases} generated cases with no accepted moves.`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL rewrite fuzz\n${message}`);
  process.exit(1);
}
