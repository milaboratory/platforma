import type { RolldownOptions } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export interface RolldownBlockKindConfigProps {
  output?: string;
}

export function createRolldownBlockKindConfig(
  props?: RolldownBlockKindConfigProps,
): RolldownOptions[] {
  const output = props?.output ?? "dist";

  return [
    {
      input: { kind: "src/index.ts" },
      external: () => false,
      plugins: [dts({ tsconfig: "tsconfig.json", emitDtsOnly: false, sourcemap: true })],
      output: {
        dir: output,
        format: "es",
        entryFileNames: "[name].js",
        sourcemap: true,
      },
      transform: {
        target: "ES2022",
      },
    },
  ];
}
