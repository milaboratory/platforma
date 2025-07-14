import type { GridApi, IRowNode } from 'ag-grid-enterprise';
import { nextTick, shallowRef, watch } from 'vue';

export function makeOnceTracker<TContext = undefined>() {
  const state = shallowRef<[false, undefined] | [true, TContext]>([false, undefined]);
  const track = (ctx: TContext): void => {
    console.log('onceTracker tracked');
    state.value = [true, ctx];
  };
  const reset = (): void => {
    console.log('onceTracker reset');
    state.value = [false, undefined];
  };
  const onceTracked = (callback: (ctx: TContext) => void) => {
    const handle = watch(
      state,
      ([tracked, context]) => {
        if (tracked) {
          callback(context);
          nextTick(() => handle.stop());
        }
      },
      { immediate: true },
    );
    return handle;
  };
  return { track, reset, onceTracked };
}
export type OnceTracker<TContext = undefined> = ReturnType<typeof makeOnceTracker<TContext>>;

function ensureNodeVisible<TData>(api: GridApi<TData>, selector: (row: IRowNode<TData>) => boolean): void {
  let rowIndex: number | null = null;
  const nodeSelector = (row: IRowNode<TData>): boolean => {
    if (selector(row)) {
      rowIndex = row.rowIndex;
      return true;
    }
    return false;
  };
  api.ensureNodeVisible(nodeSelector, 'middle');
  if (rowIndex) {
    const columns = api.getAllDisplayedColumns();
    if (columns.length > 0) {
      api.ensureColumnVisible(columns[0]);
      api.setFocusedCell(rowIndex, columns[0]);
    }
  }
};

export async function focusRow<TData>(
  selector: (row: IRowNode<TData>) => boolean,
  tracker: OnceTracker<GridApi<TData>>,
): Promise<void> {
  return new Promise((resolve) => {
    nextTick(() => tracker.onceTracked((gridApi) => {
      console.log('focusRow executed');
      ensureNodeVisible(gridApi, selector);
      resolve();
    }));
  });
}
