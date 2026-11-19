import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";
import copy from "rollup-plugin-copy";

const configs = createRolldownNodeConfig({ formats: ["es"] });

for (const config of configs) {
  config.plugins.push(
    copy({
      targets: [
        {
          src: "src/generated/*.wasm",
          dest: "dist/generated/",
        },
      ],
    }),
  );
}

export default configs;
