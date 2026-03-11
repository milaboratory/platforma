import { AllEnterpriseModule, LicenseManager, ModuleRegistry } from "ag-grid-enterprise";
import { getEnvironmentValue } from "@platforma-sdk/model";

export function activateAgGrid() {
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  const agGridLicense = getEnvironmentValue("AGGRID_LICENSE");
  if (agGridLicense) {
    LicenseManager.setLicenseKey(agGridLicense);
    console.log("AG Grid Activated");
  } else {
    console.log("AG Grid License not found");
  }
}
