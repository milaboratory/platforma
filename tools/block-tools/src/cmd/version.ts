import { Command } from "commander";
import { ConsoleLoggerAdapter, type MiLogger } from "@milaboratories/ts-helpers";
import getChangesets from "@changesets/read";
import { read as readChangesetsConfig } from "@changesets/config";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import applyReleasePlan from "@changesets/apply-release-plan";
import { readPreState } from "@changesets/pre";
import { getPackages } from "@manypkg/get-packages";
import type { ComprehensiveRelease, NewChangeset, VersionType } from "@changesets/types";

// Bump-type lattice: none < patch < minor < major.
const BUMP_ORDER: Record<VersionType, number> = { none: 0, patch: 1, minor: 2, major: 3 };

function maxBump(a: VersionType, b: VersionType): VersionType {
  return BUMP_ORDER[a] >= BUMP_ORDER[b] ? a : b;
}

function capBump(t: VersionType, cap: VersionType): VersionType {
  return BUMP_ORDER[t] <= BUMP_ORDER[cap] ? t : cap;
}

// Decision (c): a package reached only through a released `workspace:` devDependency
// is never auto-bumped to major. A major there is a human call — warn and cap to minor.
const INJECTED_BUMP_CAP: VersionType = "minor";

/**
 * `changeset version`, plus one extra rule: bump any workspace package when a
 * package it consumes through a `workspace:` `devDependencies` edge is released.
 *
 * Stock changesets forces a devDependency-only dependent to `type: "none"`
 * (@changesets/assemble-release-plan `determine-dependents`), so a block whose
 * private `model`/`ui`/`workflow`/`software` siblings changed never gets bumped —
 * even though those siblings are baked into the published `block-pack`. Blocks
 * keep the siblings in `devDependencies` on purpose (a published block is itself
 * importable by other blocks; `workspace:*` private deps in `dependencies` would
 * break `pnpm install` of a block-as-dependency), so the edge cannot simply move.
 *
 * We make changesets treat those `devDependencies` exactly like `dependencies`:
 * for every publishable/private package whose released `workspace:` devDependency
 * would otherwise be ignored, we inject an in-memory synthetic changeset at the
 * `updateInternalDependencies` floor, mirroring the highest triggering sibling
 * bump, capped at minor. Changesets then owns the version math, changelog, native
 * cascade and pre-mode handling. Synthetic changesets have no `.md` file; the apply
 * step's deletion loop is guarded by `fs.pathExists`, so they are simply skipped.
 *
 * Requires `@changesets/cli` present in the target workspace: `config.changelog`
 * defaults to `@changesets/cli/changelog`, which `applyReleasePlan` resolves
 * relative to `contextDir` (here the workspace root).
 */
export async function runVersion(cwd: string, logger: MiLogger): Promise<void> {
  const packages = await getPackages(cwd);
  const config = await readChangesetsConfig(cwd, packages);

  // Git auto-commit is intentionally unsupported. Fail loudly instead of silently
  // dropping the commit a `commit: true` config would expect (CI would then push an
  // un-versioned tree). Blocks use `commit: false`.
  if (config.commit) {
    throw new Error(
      "`block-tools version` does not support `commit: true` in .changeset/config.json. " +
        "Set `commit: false` and commit the version bump yourself (in CI or locally).",
    );
  }

  const [changesets, preState] = await Promise.all([getChangesets(cwd), readPreState(cwd)]);

  if (changesets.length === 0 && (preState === undefined || preState.mode !== "exit")) {
    logger.info("No unreleased changesets found, exiting.");
    return;
  }

  // Floor for internal-dependency-driven bumps, straight from the block's config
  // (`"patch"` in every block today). Same floor changesets applies to a normal
  // `dependencies` cascade.
  const floor: VersionType = config.updateInternalDependencies;

  const synthetic: NewChangeset[] = [];
  let syntheticCounter = 0;

  // Fixpoint: assemble, find devDependency dependents that changesets left behind,
  // inject synthetic changesets, repeat. A newly-bumped package may itself be a
  // `workspace:` devDependency of another (e.g. software -> workflow -> block), so
  // we re-derive against the augmented plan until nothing new is raised. Each pass
  // strictly raises at least one package's type, so it terminates in <= #packages.
  for (;;) {
    const plan = assembleReleasePlan([...changesets, ...synthetic], packages, config, preState);

    const releaseByName = new Map<string, ComprehensiveRelease>();
    for (const r of plan.releases) releaseByName.set(r.name, r);

    const injectedThisPass: NewChangeset[] = [];

    for (const pkg of packages.packages) {
      const devDeps = pkg.packageJson.devDependencies ?? {};

      // Released siblings reached through a `workspace:` devDependency edge, that
      // are NOT also reached through a natively-cascading field (dependencies /
      // peerDependencies / optionalDependencies) — those already bump the package.
      const triggers: ComprehensiveRelease[] = [];
      for (const [depName, range] of Object.entries(devDeps)) {
        if (typeof range !== "string" || !range.startsWith("workspace:")) continue;
        const released = releaseByName.get(depName);
        if (!released || released.type === "none") continue;
        const alsoNativeEdge =
          pkg.packageJson.dependencies?.[depName] !== undefined ||
          pkg.packageJson.peerDependencies?.[depName] !== undefined ||
          pkg.packageJson.optionalDependencies?.[depName] !== undefined;
        if (alsoNativeEdge) continue;
        triggers.push(released);
      }
      if (triggers.length === 0) continue;

      // Decision (c): mirror the highest trigger, floored at updateInternalDependencies,
      // capped at minor.
      let desired: VersionType = floor;
      for (const t of triggers) desired = maxBump(desired, t.type);
      desired = capBump(desired, INJECTED_BUMP_CAP);

      // Only inject when it raises the package above what the plan already has —
      // an author-written changeset (e.g. an explicit major) survives uncapped, and
      // we avoid redundant changelog lines (and repeated warnings across passes).
      const current = releaseByName.get(pkg.packageJson.name)?.type ?? "none";
      if (BUMP_ORDER[desired] <= BUMP_ORDER[current]) continue;

      const majorTriggers = triggers.filter((t) => t.type === "major");
      if (majorTriggers.length > 0) {
        logger.warn(
          `${pkg.packageJson.name}: internal dependency ` +
            `${majorTriggers.map((t) => t.name).join(", ")} had a MAJOR bump; capping ` +
            `${pkg.packageJson.name} to a "${desired}" bump (never auto-major). Author an ` +
            `explicit changeset for ${pkg.packageJson.name} if a major release is intended.`,
        );
      }

      injectedThisPass.push({
        id: `internal-devdep-${slug(pkg.packageJson.name)}-${syntheticCounter++}`,
        summary: `Internal dependency updates: ${triggers
          .map((t) => `${t.name}@${t.newVersion}`)
          .join(", ")}`,
        releases: [{ name: pkg.packageJson.name, type: desired }],
      });
    }

    if (injectedThisPass.length === 0) break;
    synthetic.push(...injectedThisPass);
  }

  const finalPlan = assembleReleasePlan([...changesets, ...synthetic], packages, config, preState);

  // contextDir = cwd: the block's `config.changelog` (@changesets/cli/changelog)
  // resolves from the block, which keeps @changesets/cli for the `changeset` script.
  await applyReleasePlan(finalPlan, packages, config, undefined, cwd);
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

export function versionCommand(): Command {
  const cmd = new Command("version").description(
    "Apply changesets to bump versions (drop-in for `changeset version`), additionally " +
      "bumping any package whose released sibling is reached through a `workspace:` " +
      "devDependency. Runs against the current working directory. Requires @changesets/cli " +
      "present in the workspace (for changelog resolution); does not support `commit: true`.",
  );

  cmd.action(async () => {
    await runVersion(process.cwd(), new ConsoleLoggerAdapter());
  });

  return cmd;
}
