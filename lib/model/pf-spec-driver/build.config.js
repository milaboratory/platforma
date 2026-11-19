import { createRolldownNodeConfig } from "@milaboratories/ts-builder/configs/utils/createRolldownNodeConfig.js";

// ESM only. @milaboratories/pf-spec is ESM-only, so a CJS build cannot resolve it.
export default createRolldownNodeConfig({ formats: ["es"] });
