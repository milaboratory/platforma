import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";

// ESM only: the sampler resolves its worker entry through `import.meta.url`.
// `sampler_thread` is listed explicitly because nothing imports it — it is
// reached at runtime by path, so the bundler would otherwise drop it.
export default createRolldownNodeConfig({
  entry: ["./src/index.ts", "./src/sampler_thread.ts"],
  formats: ["es"],
});
