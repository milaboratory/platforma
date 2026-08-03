import type { RolldownOptions } from "rolldown";
import { dts } from "rolldown-plugin-dts";
import { createRolldownNodeConfig, type RolldownNodeConfigProps } from "./createRolldownNodeConfig";

export interface RolldownBlockKindConfigProps extends RolldownNodeConfigProps {
  output?: string;
}

/**
 * A kind builds twice, for two consumers that want opposite things — the same
 * split `createRolldownBlockModelConfig` makes.
 *
 * - **`index.js` / `index.cjs`**, dependencies external. What a block imports. A kind
 *   that validates its params depends on a schema library, and a block model that
 *   uses the same one must end up with ONE copy in its bundle: a self-contained kind
 *   would contribute a second, and the model bundle is re-evaluated on every model-VM
 *   call, so the duplicate is paid per call rather than once.
 * - **`kind.js`**, everything inlined. What the registry publishes and what
 *   `build-kind-manifest` hashes into the kind's `manifest.json`. It has to stand alone
 *   because nothing resolves node_modules for it on the way out.
 */
export function createRolldownBlockKindConfig(
  props?: RolldownBlockKindConfigProps,
): RolldownOptions[] {
  const output = props?.output ?? "dist";

  return [
    ...createRolldownNodeConfig(props),
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
