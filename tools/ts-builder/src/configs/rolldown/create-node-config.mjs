import { createBuildEntry } from "./common.mjs";

export function createRolldownNodeConfig(props) {
  const input = props?.entry ?? ["./src/index.ts"];
  const output = props?.output ?? "dist";
  const formats = props?.formats ?? ["es", "cjs"];

  return formats.map((format) => createBuildEntry(input, output, format));
}
