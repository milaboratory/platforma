import type {
  ColumnUniversalId,
  ColumnValueOption,
  ColumnValuesSource,
} from "@platforma-sdk/model";
import { readColumnValueOptions } from "@platforma-sdk/model";
import type { ShallowRef } from "vue";
import { shallowRef, watch } from "vue";

/** The values of a picked column, as far as they are read. */
export type ColumnValueOptionsState =
  | { readonly type: "loading" }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent" }
  | { readonly type: "read"; readonly options: ColumnValueOption[] }
  | { readonly type: "failed"; readonly message: string };

/**
 * The values of the picked `column` as options of a value picker, read through the `source` the
 * model gives for it (`createColumnValuesSource`). `undefined` while no column is picked. Loading
 * while the source is resolving or still describes an earlier pick. Called from `setup`.
 */
export function useColumnValueOptions(params: {
  source: () => ColumnValuesSource | undefined;
  column: () => ColumnUniversalId | undefined;
}): Readonly<ShallowRef<ColumnValueOptionsState | undefined>> {
  const state = shallowRef<ColumnValueOptionsState | undefined>();
  let request = 0;

  watch(
    [params.column, params.source],
    ([column, source]) => {
      const current = ++request;
      if (column === undefined) {
        state.value = undefined;
        return;
      }
      if (source === undefined || source.column !== column || source.type === "resolving") {
        state.value = LOADING;
        return;
      }
      if (source.type === "absent") {
        state.value = ABSENT;
        return;
      }
      state.value = LOADING;
      readColumnValueOptions(source).then(
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

  return state;
}

// Internals

const LOADING: ColumnValueOptionsState = { type: "loading" };

const ABSENT: ColumnValueOptionsState = { type: "absent" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
