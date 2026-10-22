import type {
  ColumnUniversalId,
  ColumnValueOptionsModel,
  PresentColumnValueOptionsModel,
} from "@platforma-sdk/model";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

/** What a value picker offers, as `usePlColumnValueSettings` makes it out. */
export type PlColumnValueSettings =
  /** No column is picked, so there are no values to offer. */
  | { readonly type: "none" }
  /** The values are not there yet: the output is not computed for the picked column. */
  | { readonly type: "pending" }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent" }
  /** The values are there to read, through `model`. */
  | { readonly type: "present"; readonly model: PresentColumnValueOptionsModel };

/**
 * The settings of `PlColumnValueDropdown` and `PlColumnValueDropdownMulti`: what they offer for
 * the column picked now, `valueColumn`, out of the block output `source` made by
 * `createColumnValueOptions`. Until the output describes the picked column, the values are
 * pending, so a picker never offers the values of an earlier pick.
 */
export function usePlColumnValueSettings(options: {
  /** The block output made by `createColumnValueOptions`. */
  source: MaybeRefOrGetter<ColumnValueOptionsModel | undefined>;
  /** The column picked now. */
  valueColumn: MaybeRefOrGetter<ColumnUniversalId | undefined>;
}): ComputedRef<PlColumnValueSettings> {
  return computed(() => {
    const valueColumn = toValue(options.valueColumn);
    if (valueColumn === undefined) return NONE;
    const source = toValue(options.source);
    if (source === undefined || source.valueColumn !== valueColumn) return PENDING;
    switch (source.type) {
      case "resolving":
        return PENDING;
      case "absent":
        return ABSENT;
      case "present":
        return { type: "present", model: source };
    }
  });
}

// Internals

const NONE: PlColumnValueSettings = { type: "none" };

const PENDING: PlColumnValueSettings = { type: "pending" };

const ABSENT: PlColumnValueSettings = { type: "absent" };
