import type { MissingValueHint } from "@milaboratories/uikit";
import type { BlockDependencies } from "@platforma-sdk/model";
import { describeMissingValue } from "@platforma-sdk/model";
import { h, inject } from "vue";
import { columnLinksKey } from "../../defineApp";
import { PlBlockName } from "../PlBlockName";

/**
 * The hint explaining a missing column value by the column links the app computes for the block;
 * `undefined` outside a block. Called from `setup`.
 */
export function useColumnLinksHint(): MissingValueHint | undefined {
  const links = inject(columnLinksKey, undefined);
  if (links === undefined) return undefined;
  return missingValueHint(() => links.value?.dependencies);
}

/**
 * Explains a missing column value by the dependencies `readDependencies` gives: the block meant
 * to provide it, as a link to that block, and what went wrong.
 */
export function missingValueHint(
  readDependencies: () => BlockDependencies | undefined,
): MissingValueHint {
  return (value) => {
    const dependencies = readDependencies();
    if (dependencies === undefined) return undefined;
    const cause = describeMissingValue(dependencies, value);
    if (cause === undefined) return undefined;
    return () =>
      h("span", [
        h(PlBlockName, { blockId: cause.blockId, name: cause.blockName }),
        ` ${cause.text}`,
      ]);
  };
}
