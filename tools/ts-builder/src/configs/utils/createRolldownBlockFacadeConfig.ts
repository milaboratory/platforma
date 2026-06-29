import type { RolldownOptions } from "rolldown";
import { dts } from "rolldown-plugin-dts";

export interface RolldownBlockFacadeConfigProps {
  output?: string;
}

export function createRolldownBlockFacadeConfig(
  props?: RolldownBlockFacadeConfigProps,
): RolldownOptions[] {
  const output = props?.output ?? "dist";

  // One single-input pass per entry. Building `index` and `AGENTS` in separate
  // passes is what keeps each `.d.ts` self-contained: cross-entry chunks only
  // form within a single build, so two builds physically cannot share a hoisted
  // `index-<hash>.d.ts` chunk. Each pass inlines everything its entry needs (the
  // shared `BlockContract` is duplicated into each — self-containment is the
  // goal). Both passes write to the same `output` dir under distinct filenames.
  const entry = (name: string, input: string): RolldownOptions => ({
    input: { [name]: input },
    // Force-inline every dependency: the facade .d.ts must be self-contained and
    // the runtime .js must bundle its inlined helpers, so nothing heavy follows
    // the consumer's install.
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
  });

  return [entry("index", "src/index.ts"), entry("AGENTS", "src/AGENTS.ts")];
}
