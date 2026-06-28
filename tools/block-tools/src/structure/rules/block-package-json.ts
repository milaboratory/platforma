// Facade `package.json`: the initial generator and the drift-correcting body
// rules, co-located. The facade is the only sibling of a block that publishes,
// and it ships SLIM: `dependencies` is empty (the consumer's install pulls zero
// `@platforma-sdk/*` transitive runtime deps), siblings are build-time
// `workspace:*` devDeps, and the built `dist/` + `block-pack/` carry everything
// the loader needs.

import {
  ensureField,
  ensureScript,
  ensureDevDep,
  ensureWorkspaceScopeDevDeps,
  requireField,
  removeScript,
  enforceAlphabeticalOrder,
  enforceFieldOrder,
  type RunContext,
} from "../engine/api";
import { findModules, scopeDepMaps } from "../engine/ctx";
import { canonicalPackageJsonOrder } from "./shared/key-order";

/** Per-org publish coordinates: the S3 upload bucket and the public registry
 *  serve URL the facade's `prepublishOnly` script passes to `block-tools
 *  publish`. One block-registry bucket serves both orgs; only the public read
 *  hostname differs by org. Safe for the never-published `etc/blocks` test
 *  blocks — the script never runs for them. Extend the map per new org. */
const ORG_PUBLISH_TARGETS: Record<string, { s3: string; serveUrl: string }> = {
  "@platforma-open": {
    s3: "s3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1",
    serveUrl: "https://blocks.pl-open.science",
  },
  "@milaboratories": {
    s3: "s3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1",
    serveUrl: "https://block.registry.platforma.bio/releases",
  },
};

/** Fallback for an org not in the table — keeps the generated script valid
 *  (and inert until published) rather than throwing during a refresh. */
const FALLBACK_PUBLISH_TARGET = {
  s3: "s3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1",
  serveUrl: "https://blocks.pl-open.science",
};

/** Where the in-SDK blocks (`etc/blocks/*`) publish: the aux/dev registry, not
 *  production `pub/releases/`. These are the monorepo's test/example blocks, so
 *  one target regardless of org — their `@milaboratories` scope must NOT route
 *  them to the real catalog alongside standalone blocks. */
const SDK_INTERNAL_PUBLISH_TARGET = {
  s3: "s3://milab-euce1-prod-pkgs-s3-block-registry/aux/dev/?region=eu-central-1",
  serveUrl: "https://aux-blocks.pl-open.science",
};

function prepublishScript(npmOrg: string, isSdkInternal: boolean): string {
  const t = isSdkInternal
    ? SDK_INTERNAL_PUBLISH_TARGET
    : (ORG_PUBLISH_TARGETS[npmOrg] ?? FALLBACK_PUBLISH_TARGET);
  return `block-tools publish -r ${t.s3} --registry-serve-url ${t.serveUrl}`;
}

/** The facade's `block.components` map: the dist artifact each module build
 *  emits, keyed by role. Fully determined by the discovered modules — the body
 *  rule re-asserts this exact value, so it is engine-managed (NOT an author
 *  seed). Mirrors the artifact paths produced by each scope's build:
 *  workflow → pl-tengo, model → build-model, ui → ts-builder. */
export function blockComponents(ctx: RunContext): Record<string, string> {
  const components: Record<string, string> = {};
  for (const m of findModules(ctx, "workflow"))
    components.workflow = `${m.name}/dist/tengo/tpl/main.plj.gz`;
  for (const m of findModules(ctx, "model")) components.model = `${m.name}/dist/model.json`;
  for (const m of findModules(ctx, "ui")) components.ui = `${m.name}/dist`;
  return components;
}

/** The slim facade's canonical scripts (build / check / prepublishOnly /
 *  do-pack). Shared by the initial generator and the body rule so they cannot
 *  drift apart. `prepublishOnly` routes by block kind: in-SDK blocks publish to
 *  the aux/dev registry, standalone blocks to their per-org production target. */
function blockScripts(npmOrg: string, isSdkInternal: boolean): Record<string, string> {
  return {
    build: "ts-builder build --target block-facade && block-tools pack",
    check: "ts-builder type-check --target block-facade",
    prepublishOnly: prepublishScript(npmOrg, isSdkInternal),
    "do-pack": "pnpm pack && shx mv *.tgz package.tgz",
  };
}

/** The facade's build/publish devDependencies (the workspace `model`/`ui`/
 *  `workflow` siblings are added separately, from discovery). `sdk:` resolves
 *  to `workspace:*` for in-monorepo blocks and `catalog:` for standalone — the
 *  body rule re-asserts the same set. */
const FACADE_DEV_DEPS = {
  "@milaboratories/ts-builder": "sdk:",
  "@milaboratories/ts-configs": "sdk:",
  "@platforma-sdk/block-tools": "sdk:",
  "@platforma-sdk/model": "sdk:",
  shx: "catalog:",
  typescript: "catalog:",
} as const;

/** The facade's `exports` map: a single `.` entry. `sources` keeps monorepo IDE
 *  go-to-definition pointing at `src/` (external consumers don't enable it);
 *  `types`/`default` carry the bundled `.d.ts` / `.js` from `dist/`. No
 *  `./AGENTS` subpath — that surface ships as a registry-side component. */
const FACADE_EXPORTS = {
  ".": {
    sources: "./src/index.ts",
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  },
};

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
  // The facade's siblings are build-time devDeps, never runtime deps — the
  // facade ships its content bundled inside dist/ + block-pack/, so the
  // consumer needs no runtime resolution into siblings. Software/test are
  // excluded (the workflow owns software; a test→facade dep would be a cycle).
  const devDeps: Record<string, string> = {
    ...FACADE_DEV_DEPS,
    ...scopeDepMaps(ctx, "model"),
    ...scopeDepMaps(ctx, "ui"),
    ...scopeDepMaps(ctx, "workflow"),
  };
  // `block-tools pack` requires both `block.components` and `block.meta`. The
  // author edits the placeholder meta before publishing.
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
    // Facade is ESM: rolldown-plugin-dts requires it, and the BlockPointer's
    // `import.meta.url` path math needs it.
    type: "module",
    // Drives the npm tarball: only the built outputs ship; sources, tsconfig,
    // and node_modules stay out.
    files: ["dist", "block-pack"],
    main: "./dist/index.js",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: FACADE_EXPORTS,
    scripts: blockScripts(v.npmOrg, ctx.isSdkInternal),
    // Slim invariant: zero runtime deps reach the consumer.
    dependencies: {},
    devDependencies: devDeps,
    block,
  };
}

export function blockPackageJsonRules(ctx: RunContext): void {
  const v = ctx.blockVars;

  ensureField("type", "module");
  ensureField("files", ["dist", "block-pack"]);
  ensureField("main", "./dist/index.js");
  ensureField("module", "./dist/index.js");
  ensureField("types", "./dist/index.d.ts");
  ensureField("exports", FACADE_EXPORTS);

  const scripts = blockScripts(v.npmOrg, ctx.isSdkInternal);
  for (const [name, command] of Object.entries(scripts)) ensureScript(name, command);
  removeScript("mark-stable");

  // Slim invariant: the facade carries ZERO runtime dependencies. The siblings
  // and the SDK build/publish deps are all devDeps, so `dependencies` ends
  // empty. Software/test are excluded (the workflow owns software; a
  // test→facade dep would be a cycle).
  ensureWorkspaceScopeDevDeps("model");
  ensureWorkspaceScopeDevDeps("ui");
  ensureWorkspaceScopeDevDeps("workflow");
  ensureDevDep("@milaboratories/ts-builder", "sdk:");
  ensureDevDep("@milaboratories/ts-configs", "sdk:");
  ensureDevDep("@platforma-sdk/block-tools", "sdk:");
  ensureDevDep("@platforma-sdk/model", "sdk:");
  ensureDevDep("shx", "catalog:");
  ensureDevDep("typescript", "catalog:");

  // `block.components` is fully determined by the discovered modules — keep it
  // in sync on refresh. `block.meta` is deliberately NOT touched: it is an
  // author-owned seed (set once in the init package.json), so refresh must
  // never overwrite the author's title / description / logo.
  ensureField("block.components", blockComponents(ctx));

  // The author owns `name` and `version`; `version` MUST be present (the
  // facade publishes).
  requireField("version", "facade package.json must carry a 'version' (the facade publishes)");

  enforceAlphabeticalOrder("dependencies");
  enforceAlphabeticalOrder("devDependencies");
  enforceAlphabeticalOrder("peerDependencies");
  enforceAlphabeticalOrder("optionalDependencies");
  enforceFieldOrder([...canonicalPackageJsonOrder]);
}
