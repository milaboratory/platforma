import type { GridApi, IRowNode } from '@ag-grid-community/core';
import { nextTick, shallowRef, watchEffect } from 'vue';

export function makeOnceTracker<TContext = undefined>() {
  const state = shallowRef<[false, undefined] | [true, TContext]>([false, undefined]);
  const track = (ctx: TContext) => state.value = [true, ctx];
  const reset = () => state.value = [false, undefined];
  const onceTracked = (callback: (ctx: TContext) => void) => {
    const { stop } = watchEffect(() => {
      const [tracked, context] = state.value;
      if (tracked) {
        callback(context);
        stop();
      }
    });
    return stop;
  };
  return { track, reset, onceTracked };
}

export type OnceTracker<TContext = undefined> = ReturnType<typeof makeOnceTracker<TContext>>;

export function trackFirstDataRendered(gridApi: GridApi, tracker: OnceTracker<GridApi>) {
  gridApi.addEventListener('firstDataRendered', (event) => {
    if (event.api.getGridOption('rowModelType') === 'clientSide') {
      tracker.track(event.api);
    }
  });
  gridApi.addEventListener('modelUpdated', (event) => {
    const groupState = event.api.getServerSideGroupLevelState();
    if (groupState.length > 0 && groupState[0].lastRowIndexKnown) {
      tracker.track(event.api);
    }
  });
  gridApi.addEventListener('gridPreDestroyed', () => tracker.reset());
}

function ensureNodeVisible(api: GridApi, rowId: string) {
  let rowIndex: number | null = null;
  const nodeSelector = (row: IRowNode): boolean => {
    if (row.id === rowId) {
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

export function focusRow(rowId: string, tracker: OnceTracker<GridApi>) {
  nextTick(() => tracker.onceTracked((gridApi) => ensureNodeVisible(gridApi, rowId)));
}
