import type { RolldownOptions } from "rolldown";
import { createBuildEntry } from "./commonRolldown";

export interface RolldownNodeConfigProps {
  entry?: string[];
  output?: string;
  formats?: ("es" | "cjs")[];
}

export function createRolldownNodeConfig(props?: RolldownNodeConfigProps): RolldownOptions[] {
  const input = props?.entry ?? ["./src/index.ts"];
  const output = props?.output ?? "dist";
  const formats = props?.formats ?? ["es", "cjs"];

  return formats.map((format) => createBuildEntry(input, output, format));
}
