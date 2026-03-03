import type { RolldownOptions } from "rolldown";
import { createRolldownNodeConfig, type RolldownNodeConfigProps } from "./createRolldownNodeConfig";

export function createRolldownBlockModelConfig(props?: RolldownNodeConfigProps): RolldownOptions[] {
  const base = createRolldownNodeConfig(props);
  const input = props?.entry ?? ["./src/index.ts"];
  const output = props?.output ?? "dist";

  return [
    ...base,
    {
      input,
      output: {
        dir: output,
        name: "block-model",
        format: "umd",
        entryFileNames: "bundle.js",
        sourcemap: true,
      },
    },
  ];
}
