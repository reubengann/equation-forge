import { MathfieldElement } from "mathlive";

export type ConfigureEquationForgeEnvironmentOptions = {
  fontsDirectory?: string | null;
};

let configuredFontsDirectory: string | null | undefined;

export function configureEquationForgeEnvironment({
  fontsDirectory,
}: ConfigureEquationForgeEnvironmentOptions = {}): void {
  if (
    fontsDirectory === undefined ||
    fontsDirectory === configuredFontsDirectory
  ) {
    return;
  }
  MathfieldElement.fontsDirectory = fontsDirectory;
  configuredFontsDirectory = fontsDirectory;
}
