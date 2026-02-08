import type { BlockCodeFeatureFlags } from "../flags";
import { z } from "zod";

export const Code = z.object({
  type: z.literal("plain"),
  content: z.string(),
});

export type Code = z.infer<typeof Code>;

export type BlockCodeWithInfo = {
  readonly code: Code;
  readonly sdkVersion: string;
  readonly featureFlags: BlockCodeFeatureFlags | undefined;
};
