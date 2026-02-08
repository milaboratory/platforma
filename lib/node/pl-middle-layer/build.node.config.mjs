import { createRollupNodeConfig } from "@milaboratories/build-configs";

export default createRollupNodeConfig({
  entry: ["./src/index.ts", "./src/worker/worker.ts"],
});
