// Initial `pnpm-workspace.yaml` — packages list seeded from ctx.modules,
// catalog with the SDK pins the body verifies via `ensureCatalogPin`.

import { tryGetActiveRunContext } from "../../engine/builders";

export const SDK_CATALOG_PINS: Record<string, string> = {
  "@platforma-sdk/model": "1.0.0",
  "@platforma-sdk/ui-vue": "1.0.0",
  "@platforma-sdk/workflow-tengo": "1.0.0",
  "@platforma-sdk/test": "1.0.0",
  "@platforma-sdk/block-tools": "1.0.0",
  "@platforma-sdk/tengo-builder": "1.0.0",
  "@platforma-sdk/package-builder": "1.0.0",
  "@milaboratories/ts-builder": "1.0.0",
  "@milaboratories/ts-configs": "1.0.0",
  turbo: "2.0.0",
  shx: "0.3.4",
  "@changesets/cli": "2.27.0",
};

/** Catalog name of the python runenv. The pin is added to a block's
 *  catalog only when the block carries a software module (the workflow
 *  invokes the software entrypoint, whose env references this runenv). */
export const RUNENV_PYTHON = "@platforma-open/milaboratories.runenv-python-3";
const RUNENV_PYTHON_VERSION = "1.8.1";

export function rootPnpmWorkspaceInitial(): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const paths = (ctx?.modules ?? []).map((m) => (m.path === "" ? "." : m.path)).sort();
  const catalog: Record<string, string> = { ...SDK_CATALOG_PINS };
  if ((ctx?.modules ?? []).some((m) => m.scope === "software")) {
    catalog[RUNENV_PYTHON] = RUNENV_PYTHON_VERSION;
  }
  return {
    packages: paths,
    catalog,
  };
}
