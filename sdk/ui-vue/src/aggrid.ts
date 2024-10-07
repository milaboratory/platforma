import { getEnvironmentValue } from '@platforma-sdk/model';
import { LicenseManager } from '@ag-grid-enterprise/core';

export function setAgGridLicense() {
  const agGridLicense = getEnvironmentValue('AGGRID_LICENSE');
  if (agGridLicense) LicenseManager.setLicenseKey(agGridLicense);
}
