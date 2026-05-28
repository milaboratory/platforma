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

export function rootPnpmWorkspaceInitial(): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const paths = (ctx?.modules ?? []).map((m) => (m.path === "" ? "." : m.path)).sort();
  return {
    packages: paths,
    catalog: { ...SDK_CATALOG_PINS },
  };
}
