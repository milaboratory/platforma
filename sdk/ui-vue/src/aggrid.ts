import { LicenseManager } from '@ag-grid-enterprise/core';
import { getEnvironmentValue } from '@platforma-sdk/model';

import { ModuleRegistry } from '@ag-grid-community/core';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { InfiniteRowModelModule } from '@ag-grid-community/infinite-row-model';
import { ServerSideRowModelModule } from '@ag-grid-enterprise/server-side-row-model';
import { CsvExportModule } from '@ag-grid-community/csv-export';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { RichSelectModule } from '@ag-grid-enterprise/rich-select';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { ExcelExportModule } from '@ag-grid-enterprise/excel-export';
import { type Theme, themeQuartz } from '@ag-grid-community/theming';

export function activateAgGrid() {
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    InfiniteRowModelModule,
    ServerSideRowModelModule,
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

export const AgGridTheme: Theme = themeQuartz.withParams({
  headerColumnResizeHandleColor: 'transparent',
  accentColor: '#110529',
  borderColor: '#E1E3EB',
  cellHorizontalPaddingScale: 1,
  checkboxBorderRadius: '3px',
  checkboxUncheckedBorderColor: '#CFD1DB',
  columnBorder: true,
  columnHoverColor: '#9BABCC16',
  fontFamily: 'inherit',
  foregroundColor: '#110529',
  headerBackgroundColor: '#F7F8FA',
  headerColumnBorder: true,
  headerFontWeight: 600,
  headerRowBorder: true,
  headerVerticalPaddingScale: 0.8,
  iconButtonHoverColor: '#9BABCC32',
  iconSize: '16px',
  menuBackgroundColor: '#FFFFFF',
  menuBorder: true,
  menuTextColor: '#110529',
  rowHoverColor: '#9BABCC16',
  rowVerticalPaddingScale: 1,
  selectedRowBackgroundColor: '#63E02424',
  sidePanelBorder: false,
  spacing: '8px',
  tooltipBackgroundColor: '#110529',
  tooltipTextColor: '#FFFFFF',
  wrapperBorderRadius: '6px',
});
