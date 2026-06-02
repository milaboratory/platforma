// Initial block-level (orchestrator) `package.json`. Workspace-scope deps
// reflect the discovered modules at run time; the generator pre-computes
// them so the body rules are pure drift-correctors.

import type { BlockVars } from "../../engine/api";
import { getActiveRunContext } from "../../engine/builders";

/** The facade's `block.components` map: the dist artifact each module build
 *  emits, keyed by role. Fully determined by the discovered modules — the
 *  body rule re-asserts this exact value, so it is engine-managed (NOT an
 *  author seed). Mirrors the artifact paths produced by each scope's build:
 *  workflow → pl-tengo, model → build-model, ui → ts-builder. */
export function blockComponents(): Record<string, string> {
  const ctx = getActiveRunContext();
  const components: Record<string, string> = {};
  for (const m of ctx.modules) {
    if (m.scope === "workflow") components.workflow = `${m.name}/dist/tengo/tpl/main.plj.gz`;
    else if (m.scope === "model") components.model = `${m.name}/dist/model.json`;
    else if (m.scope === "ui") components.ui = `${m.name}/dist`;
  }
  return components;
}

export function blockPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = getActiveRunContext();
  const deps: Record<string, string> = {};
  // The facade depends on its model / ui / workflow modules — not on its
  // software module (the workflow owns that dep) and not on its test module
  // (the test package depends on the facade, so a reciprocal dep would be a
  // pnpm/turbo cycle).
  for (const m of ctx.modules) {
    if (m.scope === "model" || m.scope === "ui" || m.scope === "workflow") {
      deps[m.name] = "workspace:*";
    }
  }
  return {
    name: `${v.facadeName}.block`,
    version: "1.0.0",
    // type:"module" intentionally omitted.
    files: ["index.d.ts", "index.js"],
    scripts: {
      build: "shx rm -rf ./block-pack && block-tools pack",
      "mark-stable":
        "block-tools mark-stable -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
      prepublishOnly:
        "block-tools pack && block-tools publish -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
      "do-pack": "shx rm -f *.tgz && block-tools pack && pnpm pack && shx mv *.tgz package.tgz",
    },
    dependencies: deps,
    devDependencies: { "@platforma-sdk/block-tools": "sdk:", shx: "catalog:" },
    // `block.components` is engine-managed (re-asserted by the body rule);
    // `block.meta` is an author SEED — written once at init, never touched on
    // refresh, so the author owns title / description / organization / logo.
    // `block-tools pack` requires both. The author edits the placeholder meta
    // before publishing.
    block: {
      components: blockComponents(),
      meta: {
        title: v.shortName,
        description: `${v.shortName} block`,
        logo: "file:logos/block-logo.png",
        organization: {
          name: v.orgScope,
          url: "https://example.com",
          logo: "file:logos/organization-logo.png",
        },
      },
    },
  };
}
