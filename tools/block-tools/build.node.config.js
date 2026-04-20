import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";

export default createRolldownNodeConfig({
  entry: ["src/cmd/index.ts", "src/index.ts"],
});
