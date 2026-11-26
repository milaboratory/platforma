import type { BlockCodeFeatureFlags } from "../flags";
import * as v from "valibot";

export const Code = v.object({
  type: v.literal("plain"),
  content: v.string(),
});

export type Code = v.InferOutput<typeof Code>;

export type BlockCodeWithInfo = {
  readonly code: Code;
  readonly sdkVersion: string;
  readonly featureFlags: BlockCodeFeatureFlags | undefined;
};
