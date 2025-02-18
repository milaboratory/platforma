import { isColumnSelectionCol, type ColDef, type GridApi, type ValueGetterParams } from 'ag-grid-enterprise';
import { nextTick } from 'vue';
import { PlAgRowNumCheckbox } from '../../PlAgRowNumCheckbox';

export const PlAgDataTableRowNumberColId = '"##RowNumberColumnId##"';

const HeaderSize = 45;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeRowNumberColDef<TData = any>(): ColDef<TData> {
  return {
    colId: PlAgDataTableRowNumberColId,
    headerName: '#',
    valueGetter: (params: ValueGetterParams) => {
      if (params.node === null) return null;
      if (params.node.rowIndex === null) return null;
      return params.node.rowIndex + 1;
    },
    cellRenderer: PlAgRowNumCheckbox,
    headerClass: 'pl-ag-header-align-center',
    suppressNavigable: true,
    suppressMovable: true,
    mainMenuItems: [],
    contextMenuItems: [],
    lockPosition: 'left',
    pinned: 'left',
    lockPinned: true,
    width: HeaderSize,
    suppressSizeToFit: true,
    suppressAutoSize: true,
    cellStyle: {
      'color': 'var(--txt-03)',
      'background-color': 'var(--bg-base-light)',
      'overflow': 'visible !important',
      'text-align': 'center',
    },
    sortable: false,
    resizable: false,
  };
}

function createCellFake(): HTMLDivElement {
  const div = document.createElement('div');

  div.style.visibility = 'hidden';
  div.style.position = 'absolute';
  div.style.boxSizing = 'border-box';

  div.style.padding = '15.5px';
  div.style.border = '1px solid';
  div.style.width = 'auto';

  document.body.appendChild(div);
  return div;
}

function destroyCellFake(cellFake: HTMLDivElement) {
  document.body.removeChild(cellFake);
}

function adjustRowNumberColumnWidth(gridApi: GridApi, cellFake: HTMLDivElement, force?: boolean) {
  console.log('adjustRowNumberColumnWidth');
  console.log('gridApi.getLastDisplayedRowIndex()', gridApi.getLastDisplayedRowIndex());
  console.log('gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex())', gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex()));
  const lastDisplayedRowNumber = gridApi.getCellValue({
    rowNode: gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex())!,
    colKey: PlAgDataTableRowNumberColId,
  });
  console.log('lastDisplayedRowNumber', lastDisplayedRowNumber);
  if (typeof lastDisplayedRowNumber !== 'number') return;

  const lastDisplayedRowNumberDigitCount = lastDisplayedRowNumber.toString().length;
  if (!force && cellFake.innerHTML.length === lastDisplayedRowNumberDigitCount) return;

  const WidestDigit = '5';
  cellFake.innerHTML = WidestDigit.repeat(lastDisplayedRowNumberDigitCount);

  nextTick(() => {
    console.log('HeaderSize, cellFake.offsetWidth', HeaderSize, cellFake.offsetWidth);
    gridApi.applyColumnState({
      state: [
        {
          colId: PlAgDataTableRowNumberColId,
          pinned: 'left', // sometimes pinnig is strangely not applied
          width: Math.max(HeaderSize, cellFake.offsetWidth),
        },
      ],
    });
  });
}

function fixColumnOrder(gridApi: GridApi) {
  const columns = gridApi.getAllGridColumns() ?? [];
  const selectionIndex = columns.findIndex(isColumnSelectionCol);
  const numRowsIndex = columns.findIndex((column) => column.getId() === PlAgDataTableRowNumberColId);
  if (numRowsIndex !== -1) {
    if (selectionIndex !== -1) {
      if (selectionIndex !== 0 || numRowsIndex !== 1) {
        gridApi.moveColumns([columns[numRowsIndex], columns[selectionIndex]], 0);
      }
    } else {
      if (numRowsIndex !== 0) {
        gridApi.moveColumns([columns[numRowsIndex]], 0);
      }
    }
  }
}

export function autoSizeRowNumberColumn(gridApi: GridApi) {
  const cellFake = createCellFake();
  gridApi.addEventListener('firstDataRendered', (event) => {
    adjustRowNumberColumnWidth(event.api, cellFake);
  });
  gridApi.addEventListener('viewportChanged', (event) => {
    adjustRowNumberColumnWidth(event.api, cellFake);
  });
  gridApi.addEventListener('columnVisible', (event) => {
    if (event.columns && event.columns.some((column) => column.isVisible() && column.getColId() === PlAgDataTableRowNumberColId)) {
      adjustRowNumberColumnWidth(event.api, cellFake);
    }
  });
  gridApi.addEventListener('columnResized', (event) => {
    if (
      event.finished
      && event.source === 'autosizeColumns'
      && event.columns?.some((column) => column.isVisible() && column.getColId() === PlAgDataTableRowNumberColId)
    ) {
      adjustRowNumberColumnWidth(event.api, cellFake, true);
    }
  });
  gridApi.addEventListener('sortChanged', (event) => {
    event.api.refreshCells();
  });
  gridApi.addEventListener('filterChanged', (event) => {
    event.api.refreshCells();
  });
  gridApi.addEventListener('displayedColumnsChanged', (event) => {
    fixColumnOrder(event.api);
  });
  gridApi.addEventListener('gridPreDestroyed', () => {
    destroyCellFake(cellFake);
  });
  adjustRowNumberColumnWidth(gridApi, cellFake);
  fixColumnOrder(gridApi);
}
