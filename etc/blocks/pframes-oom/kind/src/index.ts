import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

export const kind = defineBlockKind<Record<string, never>>({
  name,
  version,
  parseInitializationParams(value: unknown) {
    assertParamsObject(value);
    return {};
  },
});
