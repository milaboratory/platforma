import type { ColDef, GridApi, ValueGetterParams } from '@ag-grid-community/core';
import { nextTick } from 'vue';

export const PlAgDataTableRowNumberColId = '"##RowNumberColumnId##"';

export function makeRowNumberColDef(): ColDef {
  return {
    colId: PlAgDataTableRowNumberColId,
    headerName: '#',
    valueGetter: (params: ValueGetterParams) => {
      if (params.node === null) return null;
      if (params.node.rowIndex === null) return null;
      return params.node.rowIndex + 1;
    },
    headerClass: 'pl-ag-header-align-center',
    suppressNavigable: true,
    lockPosition: 'left',
    suppressMovable: true,
    mainMenuItems: [],
    contextMenuItems: [],
    pinned: 'left',
    lockPinned: true,
    minWidth: 45, // header size
    suppressSizeToFit: true,
    suppressAutoSize: true,
    cellStyle: {
      color: 'var(--txt-03)',
      'background-color': 'var(--bg-base-light)',
      overflow: 'visible !important',
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

function adjustRowNumberColumnWidth(gridApi: GridApi, cellFake: HTMLDivElement) {
  const lastDisplayedRowNumber = gridApi.getCellValue({
    rowNode: gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex())!,
    colKey: PlAgDataTableRowNumberColId,
  });
  if (typeof lastDisplayedRowNumber !== 'number') return;

  const lastDisplayedRowNumberDigitCount = lastDisplayedRowNumber.toString().length;
  if (cellFake.innerHTML.length === lastDisplayedRowNumberDigitCount) return;

  const WidestDigit = '5';
  cellFake.innerHTML = WidestDigit.repeat(lastDisplayedRowNumberDigitCount);

  nextTick(() => {
    gridApi.setColumnWidths([
      {
        key: PlAgDataTableRowNumberColId,
        newWidth: cellFake.offsetWidth,
      },
    ]);
  });
}

function destroyCellFake(cellFake: HTMLElement) {
  document.body.removeChild(cellFake);
}

export function autoSizeRowNumberColumn(gridApi: GridApi) {
  const cellFake = createCellFake();
  gridApi.addEventListener('viewportChanged', () => {
    adjustRowNumberColumnWidth(gridApi, cellFake);
  });
  gridApi.addEventListener('columnVisible', (event) => {
    if (event.columns && event.columns.some((column) => column.isVisible() && column.getColId() === PlAgDataTableRowNumberColId)) {
      adjustRowNumberColumnWidth(gridApi, cellFake);
    }
  });
  gridApi.addEventListener('gridPreDestroyed', () => {
    destroyCellFake(cellFake);
  });
}
