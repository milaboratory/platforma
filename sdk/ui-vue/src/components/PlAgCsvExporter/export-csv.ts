import {
  type ColDef,
  type ColGroupDef,
  createGrid,
  type GridApi,
  type GridOptions,
  ServerSideRowModelModule,
} from 'ag-grid-enterprise';

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

export async function exportCsv(gridApi: GridApi, completed: () => void) {
  const rowModel = gridApi.getGridOption('rowModelType');
  switch (rowModel) {
    case 'clientSide': {
      gridApi.exportDataAsCsv();
      return completed();
    }

    case 'serverSide': {
      const state = gridApi.getServerSideGroupLevelState();
      if (state.length === 0 || state[0].rowCount <= state[0].cacheBlockSize!) {
        gridApi.exportDataAsCsv();
        return completed();
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
        cacheBlockSize: state[0].rowCount,
        onModelUpdated: (event) => {
          const state = event.api.getServerSideGroupLevelState();
          if (state.length > 0 && state[0].rowCount === state[0].cacheBlockSize) {
            event.api.exportDataAsCsv();
            destroyGridDiv(gridDiv);
            return completed();
          }
        },
        defaultCsvExportParams: gridApi.getGridOption('defaultCsvExportParams'),
      };
      return createGrid(gridDiv, gridOptions, { modules: [ServerSideRowModelModule] });
    }

    default: {
      completed();
      throw Error(`exportCsv unsupported for rowModelType = ${rowModel}`);
    }
  }
};
