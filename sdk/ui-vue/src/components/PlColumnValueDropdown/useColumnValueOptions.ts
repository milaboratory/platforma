import type { ColumnValueOption } from "@platforma-sdk/model";
import { readColumnValueOptions } from "@platforma-sdk/model";
import type { ComputedRef } from "vue";
import { computed, shallowRef, watch } from "vue";
import type { PlColumnValueSettings } from "./settings";

/** The options of a value picker, read as its settings say. */
export type ColumnValueOptions = {
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
 * Reads the options of a value picker through the frame its `settings` hold. A read made for
 * earlier settings is dropped. Called from `setup`.
 */
export function useColumnValueOptions(settings: () => PlColumnValueSettings): ColumnValueOptions {
  const state = shallowRef<ReadState>(LOADING);
  let request = 0;

  watch(
    settings,
    (current) => {
      const own = ++request;
      switch (current.type) {
        case "none":
        case "pending":
          state.value = LOADING;
          return;
        case "absent":
          state.value = { type: "failed", message: ABSENT_MESSAGE };
          return;
        case "present":
          state.value = LOADING;
          readColumnValueOptions(current.model).then(
            (options) => {
              if (own === request) state.value = { type: "read", options };
            },
            (error: unknown) => {
              if (own === request) state.value = { type: "failed", message: messageOf(error) };
            },
          );
      }
    },
    { immediate: true },
  );

  return {
    options: computed(() => {
      const value = state.value;
      if (value.type === "loading") return undefined;
      return value.type === "read" ? value.options : [];
    }),
    error: computed(() => (state.value.type === "failed" ? state.value.message : undefined)),
  };
}

// Internals

type ReadState =
  | { readonly type: "loading" }
  | { readonly type: "read"; readonly options: ColumnValueOption[] }
  | { readonly type: "failed"; readonly message: string };

const LOADING: ReadState = { type: "loading" };

const ABSENT_MESSAGE = "The picked column is not available";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
