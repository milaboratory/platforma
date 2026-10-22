import type {
  ColumnUniversalId,
  ColumnValueOption,
  ColumnValueOptionsModel,
} from "@platforma-sdk/model";
import { readColumnValueOptions } from "@platforma-sdk/model";
import type { ComputedRef, ShallowRef } from "vue";
import { computed, shallowRef, watch } from "vue";

/** The options of a value picker, as far as they are read. */
export type ColumnValueOptionsState =
  | { readonly type: "loading" }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent" }
  | { readonly type: "read"; readonly options: ColumnValueOption[] }
  | { readonly type: "failed"; readonly message: string };

/** The options of a value picker, read through the model a block output gives. */
export type PlColumnValueOptions = {
  /** `undefined` while there is no column to offer the values of. */
  readonly state: Readonly<ShallowRef<ColumnValueOptionsState | undefined>>;
  /**
   * The options as a picker takes them: `undefined`, shown as loading, until they are read; none
   * once the column is gone or cannot be read, so that its picks stay picked and are shown as not
   * available.
   */
  readonly options: ComputedRef<ColumnValueOption[] | undefined>;
  /** Why the column offers no options: it is gone, or its values cannot be read. */
  readonly error: ComputedRef<string | undefined>;
};

/**
 * The options of a value picker over the column a block output describes, made in the model by
 * `createColumnValueOptions`. Called from `setup`.
 *
 * `valueColumn` is the column picked now, when the user picks it: until the output describes that
 * column, the options are loading, and while nothing is picked there are none to read. Without
 * it, the output is taken as it is.
 */
export function usePlColumnValueOptions(params: {
  source: () => ColumnValueOptionsModel | undefined;
  valueColumn?: () => ColumnUniversalId | undefined;
}): PlColumnValueOptions {
  const { source, valueColumn } = params;
  const state = shallowRef<ColumnValueOptionsState | undefined>();
  let request = 0;

  watch(
    [source, () => (valueColumn === undefined ? NOT_TRACKED : valueColumn())],
    ([model, picked]) => {
      const current = ++request;
      if (picked === undefined || (model === undefined && picked === NOT_TRACKED)) {
        state.value = undefined;
        return;
      }
      if (
        model === undefined ||
        (picked !== NOT_TRACKED && model.valueColumn !== picked) ||
        model.type === "resolving"
      ) {
        state.value = LOADING;
        return;
      }
      if (model.type === "absent") {
        state.value = ABSENT;
        return;
      }
      state.value = LOADING;
      readColumnValueOptions(model).then(
        (options) => {
          if (current === request) state.value = { type: "read", options };
        },
        (error: unknown) => {
          if (current === request) state.value = { type: "failed", message: messageOf(error) };
        },
      );
    },
    { immediate: true },
  );

  const options = computed(() => {
    const value = state.value;
    if (value === undefined || value.type === "loading") return undefined;
    return value.type === "read" ? value.options : [];
  });

  const error = computed(() => {
    const value = state.value;
    if (value?.type === "absent") return ABSENT_MESSAGE;
    return value?.type === "failed" ? value.message : undefined;
  });

  return { state, options, error };
}

// Internals

/** Stands for a `valueColumn` that is not given, apart from one that gives no column. */
const NOT_TRACKED = Symbol("not tracked");

const LOADING: ColumnValueOptionsState = { type: "loading" };

const ABSENT: ColumnValueOptionsState = { type: "absent" };

const ABSENT_MESSAGE = "The picked column is not available";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
