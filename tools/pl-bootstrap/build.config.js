import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";

// `block.ts` is a second entry so `@platforma-sdk/bootstrap/block` gets its own
// type declarations: servers (e.g. a function that seeds new block repos) import
// `createBlockFromOptions` from there without loading the CLI.
export default createRolldownNodeConfig({
  entry: ["./src/index.ts", "./src/block.ts"],
});
