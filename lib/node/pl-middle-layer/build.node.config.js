import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";

export default createRolldownNodeConfig({
  entry: ["./src/index.ts", "./src/worker/worker.ts"],
});
