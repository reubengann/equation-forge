import { MathfieldElement } from "mathlive";

export type ConfigurePadEnvironmentOptions = {
  fontsDirectory?: string;
};

let configuredFontsDirectory: string | undefined;

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
