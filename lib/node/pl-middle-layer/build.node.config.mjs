import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/rolldown/create-node-config.mjs";

export default createRolldownNodeConfig({
  entry: ["./src/index.ts", "./src/worker/worker.ts"],
});
