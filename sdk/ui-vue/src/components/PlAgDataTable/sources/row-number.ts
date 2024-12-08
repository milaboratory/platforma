import type { ColDef, GridApi, ValueGetterParams } from '@ag-grid-community/core';
import { nextTick } from 'vue';

export const PlAgDataTableRowNumberColId = '"##RowNumberColumnId##"';

const HeaderSize = 45;

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

function adjustRowNumberColumnWidth(gridApi: GridApi, cellFake: HTMLDivElement, force?: boolean) {
  const lastDisplayedRowNumber = gridApi.getCellValue({
    rowNode: gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex())!,
    colKey: PlAgDataTableRowNumberColId,
  });
  if (typeof lastDisplayedRowNumber !== 'number') return;

  const lastDisplayedRowNumberDigitCount = lastDisplayedRowNumber.toString().length;
  if (!force && cellFake.innerHTML.length === lastDisplayedRowNumberDigitCount) return;

  const WidestDigit = '5';
  cellFake.innerHTML = WidestDigit.repeat(lastDisplayedRowNumberDigitCount);

  nextTick(() => {
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
  gridApi.addEventListener('columnResized', (event) => {
    if (
      event.finished
      && event.source === 'autosizeColumns'
      && event.columns?.some((column) => column.isVisible() && column.getColId() === PlAgDataTableRowNumberColId)
    ) {
      adjustRowNumberColumnWidth(gridApi, cellFake, true);
    }
  });
  gridApi.addEventListener('gridPreDestroyed', () => {
    destroyCellFake(cellFake);
  });
  adjustRowNumberColumnWidth(gridApi, cellFake);
}
