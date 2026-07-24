import type { RolldownOptions } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export interface RolldownBlockKindConfigProps {
  output?: string;
}

export function createRolldownBlockKindConfig(
  props?: RolldownBlockKindConfigProps,
): RolldownOptions[] {
  const output = props?.output ?? "dist";

  // A block-kind has a single entry (`src/index.ts`) — the compiled kind
  // descriptor produced by `defineBlockKind`. Unlike the facade (index + AGENTS,
  // built in two passes to keep each `.d.ts` self-contained), one entry needs
  // only one pass, so the facade's index/AGENTS split is dropped here.
  return [
    {
      input: { kind: "src/index.ts" },
      // Force-inline every dependency: the kind `.d.ts` must be self-contained
      // (PlRef and friends inlined) and the runtime `.js` must bundle its own
      // helpers, so nothing heavy follows a consumer's install.
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
  ]; // emits kind.js + self-contained kind.d.ts
}
