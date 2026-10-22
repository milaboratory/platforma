import type { BlockDependencies } from "@platforma-sdk/model";
import { describeMissingValue } from "@platforma-sdk/model";
import type { FunctionalComponent } from "vue";
import { h, inject } from "vue";
import { columnLinksKey } from "../../columnLinks";
import { PlBlockName } from "../PlBlockName";

/**
 * How a picker shows a selected column or column value missing from its options, by the column
 * links of the block: the text in its place and the tooltip over it, `undefined` where the links
 * tell nothing about the value.
 */
export type ColumnLinksMissingValue = {
  label: (value: unknown) => string | undefined;
  tooltip: (value: unknown) => FunctionalComponent | undefined;
};

/**
 * How the pickers of the block show a missing value, by the column links the app computes for
 * it; `undefined` outside a block. Called from `setup`.
 */
export function useColumnLinksMissingValue(): ColumnLinksMissingValue | undefined {
  const links = inject(columnLinksKey, undefined);
  if (links === undefined) return undefined;
  return columnLinksMissingValue(() => links.value?.dependencies);
}

/**
 * How a picker shows a missing value by the dependencies `readDependencies` gives. The text is
 * the picked value or the label of the column selected as a whole: alone while it waits for the
 * other inputs of the block, marked as not available otherwise. The tooltip names the block meant
 * to provide it, as a link to that block, and what went wrong; or that it waits for the other
 * inputs.
 */
export function columnLinksMissingValue(
  readDependencies: () => BlockDependencies | undefined,
): ColumnLinksMissingValue {
  const causeOf = (value: unknown) => {
    const dependencies = readDependencies();
    return dependencies === undefined ? undefined : describeMissingValue(dependencies, value);
  };
  return {
    label: (value) => {
      const cause = causeOf(value);
      if (cause === undefined || cause.name === null) return undefined;
      return cause.type === "waiting" ? cause.name : `${cause.name} — not available`;
    },
    tooltip: (value) => {
      const cause = causeOf(value);
      if (cause === undefined) return undefined;
      if (cause.type === "waiting") return () => cause.text;
      return () =>
        h("span", [
          h(PlBlockName, { blockId: cause.blockId, name: cause.blockName }),
          ` ${cause.text}`,
        ]);
    },
  };
}
