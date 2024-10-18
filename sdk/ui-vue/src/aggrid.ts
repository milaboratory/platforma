import { LicenseManager } from '@ag-grid-enterprise/core';
import { getEnvironmentValue } from '@platforma-sdk/model';

import { ModuleRegistry } from '@ag-grid-community/core';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { InfiniteRowModelModule } from '@ag-grid-community/infinite-row-model';
import { CsvExportModule } from '@ag-grid-community/csv-export';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { RichSelectModule } from '@ag-grid-enterprise/rich-select';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { ExcelExportModule } from '@ag-grid-enterprise/excel-export';

export function activateAgGrid() {
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    InfiniteRowModelModule,
    CsvExportModule,
    ClipboardModule,
    RangeSelectionModule,
    RichSelectModule,
    MenuModule,
    ExcelExportModule,
  ]);
  const agGridLicense = getEnvironmentValue('AGGRID_LICENSE');
  if (agGridLicense) {
    LicenseManager.setLicenseKey(agGridLicense);
    console.log('AG Grid Activated');
  } else {
    console.log('AG Grid License not found');
  }
}
