import type { GridApi } from 'ag-grid-enterprise';

/**
 * Returns the number of selected rows in the grid.
 * @param gridApi - The grid API.
 * @returns The number of selected rows.
 */
export function getSelectedRowsCount(gridApi: GridApi) {
  if (!gridApi.getGridOption('loading')) {
    const rowModel = gridApi.getGridOption('rowModelType');
    switch (rowModel) {
      case 'clientSide': {
        return gridApi.getSelectedRows().length;
      }
      case 'serverSide': {
        const state = gridApi.getServerSideSelectionState();
        // `state.selectAll` flag is ignored as we assume `selectAll` was used to select all rows
        return state?.toggledNodes?.length ?? 0;
      }
    }
  }
  return 0;
}

/**
 * Selects all rows in the grid.
 * @param gridApi - The grid API.
 */
export function selectAll(gridApi: GridApi) {
  const rowModel = gridApi.getGridOption('rowModelType');
  switch (rowModel) {
    case 'clientSide': {
      gridApi.selectAll();
      break;
    }
    case 'serverSide': {
      // Instead of using `selectAll` we set selection state manually
      // as `selectAll` will not give us the selected rows ids.
      // `forEachNode` goes over all cached rows, so increase cached block size
      // to match the number of rows you expect to be selected at most
      gridApi.forEachNode((node) => {
        node.setSelected(true);
      });
    }
  }
}

/**
 * Deselects all rows in the grid.
 * @param gridApi - The grid API.
 */
export function deselectAll(gridApi: GridApi) {
  const rowModel = gridApi.getGridOption('rowModelType');
  switch (rowModel) {
    case 'clientSide': {
      gridApi.deselectAll();
      break;
    }
    case 'serverSide': {
      gridApi.setServerSideSelectionState({
        selectAll: false,
        toggledNodes: [],
      });
    }
  }
}

/**
 * Returns the total number of rows in the grid.
 * @param gridApi - The grid API.
 * @returns The total number of rows.
 */
export function getTotalRowsCount(gridApi: GridApi) {
  return gridApi.getGridOption('loading') ? 0 : gridApi.getDisplayedRowCount();
}

/**
 * Returns true if selection is enabled in the grid.
 * @param gridApi - The grid API.
 * @returns True if selection is enabled.
 */
export function isSelectionEnabled(gridApi: GridApi) {
  return Boolean(gridApi.getGridOption('rowSelection'));
}
