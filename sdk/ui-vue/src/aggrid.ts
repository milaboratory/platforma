import { LicenseManager, type Theme, themeQuartz, createPart, ModuleRegistry, AllEnterpriseModule } from 'ag-grid-enterprise';
import { getEnvironmentValue } from '@platforma-sdk/model';
import OverrideCss from './components/PlAgDataTable/ag-override.css?raw';

export function activateAgGrid() {
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  const agGridLicense = getEnvironmentValue('AGGRID_LICENSE');
  if (agGridLicense) {
    LicenseManager.setLicenseKey(agGridLicense);
    console.log('AG Grid Activated');
  } else {
    console.log('AG Grid License not found');
  }
}

const agGridOverrideStyles = createPart({ feature: 'headerBottomBorder', css: OverrideCss });

export const AgGridTheme: Theme = themeQuartz
  .withParams({
    headerColumnResizeHandleColor: 'transparent',
    accentColor: '#49cc49',
    borderColor: '#E1E3EB',
    cellHorizontalPaddingScale: 1,
    checkboxBorderRadius: '3px',
    checkboxCheckedBackgroundColor: '#110529',
    checkboxCheckedBorderColor: '#110529',
    checkboxIndeterminateBackgroundColor: '#110529',
    checkboxIndeterminateBorderColor: '#110529',
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
  })
  .withPart(agGridOverrideStyles);
