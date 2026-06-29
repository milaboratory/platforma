import { envs, defaults, type Builder } from "@platforma-sdk/package-builder-lib";
import type { BuildPlan } from "./knobs";

// Pass-through controls mirroring `pl-pkg build`. Empty means "engine default".
export interface BuildOptions {
  ids?: string[];
  force?: boolean;
  contentRoot?: string;
  storageUrl?: string;
  dockerRegistry?: string;
  dockerPushTo?: string;
  dockerBuild?: boolean;
  dockerNoBuild?: boolean;
  dockerAutopush?: boolean;
  dockerNoAutopush?: boolean;
  condaBuild?: boolean;
  condaNoBuild?: boolean;
}

// Run a build plan against the engine in one pass: build, push when the target is remote, then
// write the descriptor last — "ready ⟺ the descriptor exists". The builder is injected (already
// configured with mode/version/platform) so this stays pure orchestration.
export async function runBuild(core: Builder, plan: BuildPlan, opts: BuildOptions): Promise<void> {
  const ids = opts.ids;

  // Legacy (no location knob) defers docker build/push to the CI default; otherwise the plan decides.
  const buildDocker = plan.isCIDefaultPush
    ? shouldDoAction(envs.isCI(), opts.dockerBuild, opts.dockerNoBuild)
    : plan.buildDocker;
  const pushDocker = plan.isCIDefaultPush
    ? buildDocker &&
      shouldDoAction(envs.isCI() && !core.isPrivate, opts.dockerAutopush, opts.dockerNoAutopush)
    : plan.pushDocker;

  const dockerRegistry =
    opts.dockerRegistry ?? (plan.isDev && buildDocker ? defaults.DEV_DOCKER_REGISTRY : undefined);

  // 1. BUILD (descriptor not written yet).
  if (buildDocker) {
    core.buildDockerImages({ ids, registry: dockerRegistry, strictPlatformMatching: envs.isCI() });
  }
  if (plan.usePublished) {
    core.writePublishedArtifactInfo({ ids });
  } else if (plan.buildBinary) {
    await core.buildSoftwareArchives({
      ids,
      forceBuild: Boolean(opts.force),
      contentRoot: opts.contentRoot,
      skipIfEmpty: ids ? false : true,
      condaBuild: shouldDoAction(true, opts.condaBuild, opts.condaNoBuild),
    });
  }

  // 2. PUSH when the target is remote (still no descriptor on disk).
  if (pushDocker) {
    core.publishDockerImages({
      ids,
      pushTo: opts.dockerPushTo,
      strictPlatformMatching: envs.isCI(),
    });
  }
  if (plan.uploadBinary) {
    // storageURL falls through to the engine, which resolves the dev/release endpoint.
    await core.publishPackages({ ids, storageURL: opts.storageUrl });
  }

  // 3. DESCRIPTOR LAST — only after build + push have succeeded.
  core.buildSwJsonFiles({ packageIds: ids });
}

// pl-pkg's tri-state flag resolution: explicit no-flag wins, then explicit yes-flag, else default.
function shouldDoAction(defaultValue: boolean, doFlag?: boolean, noDoFlag?: boolean): boolean {
  if (noDoFlag) return false;
  if (doFlag) return true;
  return defaultValue;
}
