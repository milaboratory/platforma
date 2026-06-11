// Block-level (orchestrator) `package.json`: the initial generator and the
// drift-correcting body rules, co-located. Workspace-scope deps reflect the
// discovered modules at run time; the generator pre-computes them and the
// body rule re-asserts them.

import {
  ensureField,
  ensureScript,
  ensureDevDep,
  ensureWorkspaceScopeDeps,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { findModules, scopeDepMap } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";

/** The facade's `block.components` map: the dist artifact each module build
 *  emits, keyed by role. Fully determined by the discovered modules — the
 *  body rule re-asserts this exact value, so it is engine-managed (NOT an
 *  author seed). Mirrors the artifact paths produced by each scope's build:
 *  workflow → pl-tengo, model → build-model, ui → ts-builder. */
export function blockComponents(ctx: RunContext): Record<string, string> {
  const components: Record<string, string> = {};
  for (const m of findModules(ctx, "workflow"))
    components.workflow = `${m.name}/dist/tengo/tpl/main.plj.gz`;
  for (const m of findModules(ctx, "model")) components.model = `${m.name}/dist/model.json`;
  for (const m of findModules(ctx, "ui")) components.ui = `${m.name}/dist`;
  return components;
}

/** Fail loudly if any required `block.*` field is empty — a missing
 *  title / description / logo / organization or empty components map would
 *  otherwise produce an init block that `block-tools pack` rejects only
 *  later. Asserted at generation time so the failure is immediate. */
function assertBlockFieldsFilled(block: {
  components: Record<string, string>;
  meta: Record<string, unknown>;
}): void {
  if (Object.keys(block.components).length === 0) {
    throw new Error("block.components is empty — no workflow/model/ui module was discovered");
  }
  const meta = block.meta as {
    title?: unknown;
    description?: unknown;
    logo?: unknown;
    organization?: { name?: unknown; url?: unknown; logo?: unknown };
  };
  const required: [string, unknown][] = [
    ["block.meta.title", meta.title],
    ["block.meta.description", meta.description],
    ["block.meta.logo", meta.logo],
    ["block.meta.organization.name", meta.organization?.name],
    ["block.meta.organization.url", meta.organization?.url],
    ["block.meta.organization.logo", meta.organization?.logo],
  ];
  for (const [path, value] of required) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`required block field '${path}' is empty`);
    }
  }
}

export function blockPackageJsonInitial(ctx: RunContext): Record<string, unknown> {
  const v = ctx.blockVars;
  // The facade depends on its model / ui / workflow modules — not on its
  // software module (the workflow owns that dep) and not on its test module
  // (the test package depends on the facade, so a reciprocal dep would be a
  // pnpm/turbo cycle).
  const deps: Record<string, string> = {
    ...scopeDepMap(ctx, "model"),
    ...scopeDepMap(ctx, "ui"),
    ...scopeDepMap(ctx, "workflow"),
  };
  // `block.components` is engine-managed (re-asserted by the body rule);
  // `block.meta` is an author SEED — written once at init, never touched on
  // refresh, so the author owns title / description / organization / logo.
  // `block-tools pack` requires both. The author edits the placeholder meta
  // before publishing.
  const block = {
    components: blockComponents(ctx),
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
  };
  assertBlockFieldsFilled(block);
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
    block,
  };
}

export function blockPackageJsonRules(): void {
  // type:"module" intentionally omitted: the facade's index.js is the
  // CommonJS dev-block descriptor (module.exports / __dirname); ESM would
  // break it. The facade has no TS sources to compile.
  ensureField("files", ["index.d.ts", "index.js"]);

  ensureScript("build", "shx rm -rf ./block-pack && block-tools pack");
  ensureScript(
    "mark-stable",
    "block-tools mark-stable -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
  );
  ensureScript(
    "prepublishOnly",
    "block-tools pack && block-tools publish -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
  );
  ensureScript(
    "do-pack",
    "shx rm -f *.tgz && block-tools pack && pnpm pack && shx mv *.tgz package.tgz",
  );

  // One workspace dep per discovered module in the facade's scopes. The
  // facade depends on model / ui / workflow — not software (the workflow
  // owns it) and not test (a reciprocal dep would be a pnpm/turbo cycle).
  ensureWorkspaceScopeDeps("model");
  ensureWorkspaceScopeDeps("ui");
  ensureWorkspaceScopeDeps("workflow");

  ensureDevDep("@platforma-sdk/block-tools", "sdk:");
  // shx powers the cross-platform build / do-pack scripts above.
  ensureDevDep("shx", "catalog:");

  // `block.components` is fully determined by the discovered modules — keep
  // it in sync on refresh. `block.meta` is deliberately NOT touched here: it
  // is an author-owned seed (set once in the init package.json), so refresh
  // must never overwrite the author's title / description / logo.
  ensureField("block.components", blockComponents(getActiveRunContext()));

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
