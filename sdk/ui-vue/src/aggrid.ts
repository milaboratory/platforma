import { getEnvironmentValue } from '@platforma-sdk/model';
import { LicenseManager } from '@ag-grid-enterprise/core';

export function setAgGridLicense() {
  const agGridLicense = getEnvironmentValue('AGGRID_LICENSE');
  console.log(agGridLicense);
  if (agGridLicense) {
    LicenseManager.setLicenseKey(agGridLicense);
    console.log(agGridLicense);
  }
}
