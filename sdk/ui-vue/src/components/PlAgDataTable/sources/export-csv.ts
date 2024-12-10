import type { ColDef, ColGroupDef } from '@ag-grid-community/core';
import { createGrid, type GridApi, type GridOptions } from '@ag-grid-community/core';
import type { PlAgDataTableRow } from '../types';
import { ServerSideRowModelModule } from '@ag-grid-enterprise/server-side-row-model';

function createGridDiv(): HTMLDivElement {
  const div = document.createElement('div');

  div.style.visibility = 'hidden';
  div.style.position = 'absolute';

  document.body.appendChild(div);
  return div;
}

function destroyGridDiv(cellFake: HTMLDivElement) {
  document.body.removeChild(cellFake);
}

export async function exportCsv(gridApi?: GridApi<PlAgDataTableRow>) {
  if (!gridApi) return;

  const rowModel = gridApi.getGridOption('rowModelType');
  switch (rowModel) {
    case 'clientSide': {
      return gridApi.exportDataAsCsv();
    }

    case 'serverSide': {
      const groupState = gridApi.getServerSideGroupLevelState();
      if (groupState.length === 0) return;

      const state = groupState[0];
      if (state.rowCount <= state.cacheBlockSize!) {
        return gridApi.exportDataAsCsv();
      }

      const gridDiv = createGridDiv();
      const gridOptions: GridOptions = {
        rowModelType: 'serverSide',
        columnDefs: gridApi.getColumnDefs()
          ?.filter((def: ColDef | ColGroupDef): def is ColDef => !('children' in def))
          .map((def) => ({
            headerName: def.headerName,
            field: def.field,
            valueFormatter: def.valueFormatter,
            valueGetter: def.valueGetter,
          })) ?? [],
        serverSideDatasource: gridApi.getGridOption('serverSideDatasource'),
        cacheBlockSize: state.rowCount,
        onModelUpdated: (event) => {
          const groupState = event.api.getServerSideGroupLevelState();
          if (groupState.length === 0) return;

          const state = groupState[0];
          if (state.rowCount !== state.cacheBlockSize) return;

          event.api.exportDataAsCsv();
          destroyGridDiv(gridDiv);
        },
        defaultCsvExportParams: gridApi.getGridOption('defaultCsvExportParams'),
      };
      return createGrid(gridDiv, gridOptions, { modules: [ServerSideRowModelModule] });
    }

    default:
      throw Error(`exportCsv unsupported for rowModelType = ${rowModel}`);
  }
};
