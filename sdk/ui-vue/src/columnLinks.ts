import type { BlockColumnLinks } from "@platforma-sdk/model";
import type { ComputedRef, InjectionKey } from "vue";

/** Column links of the block, as the app computes them; `undefined` in apps that do not. */
export const columnLinksKey: InjectionKey<ComputedRef<BlockColumnLinks | undefined>> =
  Symbol("column-links");
