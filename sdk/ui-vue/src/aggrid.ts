import { LicenseManager } from '@ag-grid-enterprise/core';
import { getEnvironmentValue } from '@platforma-sdk/model';

export function activateAgGrid() {
  const agGridLicense = getEnvironmentValue('AGGRID_LICENSE');
  if (agGridLicense) {
    LicenseManager.setLicenseKey(agGridLicense);
    console.log('AG Grid Activated');
  } else {
    console.log('AG Grid License not found');
  }
}
