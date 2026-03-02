import { createRolldownNodeConfig } from "./create-node-config.mjs";

export function createRolldownBlockModelConfig(props) {
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
