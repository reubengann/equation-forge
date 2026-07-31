import { MathfieldElement } from "mathlive";

export type ConfigurePadEnvironmentOptions = {
  fontsDirectory?: string | null;
};

let configuredFontsDirectory: string | null | undefined;

export function configurePadEnvironment({
  fontsDirectory,
}: ConfigurePadEnvironmentOptions = {}): void {
  if (
    fontsDirectory === undefined ||
    fontsDirectory === configuredFontsDirectory
  ) {
    return;
  }
  MathfieldElement.fontsDirectory = fontsDirectory;
  configuredFontsDirectory = fontsDirectory;
}
