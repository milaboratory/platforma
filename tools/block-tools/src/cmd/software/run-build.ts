import { util, envs, defaults, type Builder } from "@platforma-sdk/package-builder-lib";
import type { Channel, Scenario } from "./knobs";

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

// Build a scenario against the engine in one pass: build, push when the target is remote, then write
// the descriptor last — "ready ⟺ the descriptor exists". The builder is injected (already configured
// with version/platform); runBuild sets the scenario-derived build mode and drives the engine.
export async function runBuild(
  core: Builder,
  scenario: Scenario,
  opts: BuildOptions,
): Promise<void> {
  const ids = opts.ids;
  core.buildMode = buildModeFor(scenario);

  const buildBinary = () =>
    core.buildSoftwareArchives({
      ids,
      forceBuild: Boolean(opts.force),
      contentRoot: opts.contentRoot,
      skipIfEmpty: ids ? false : true,
      condaBuild: shouldDoAction(true, opts.condaBuild, opts.condaNoBuild),
    });

  switch (scenario.kind) {
    case "use-published":
      // Descriptor points at an already-published release artifact; nothing is built or pushed.
      core.writePublishedArtifactInfo({ ids });
      break;

    case "legacy": {
      // Bare pl-pkg-parity invocation: docker build/push follow the CI default + flags.
      const buildDocker = shouldDoAction(envs.isCI(), opts.dockerBuild, opts.dockerNoBuild);
      const pushDocker =
        buildDocker &&
        shouldDoAction(envs.isCI() && !core.isPrivate, opts.dockerAutopush, opts.dockerNoAutopush);

      if (buildDocker) {
        core.buildDockerImages({
          ids,
          registry: opts.dockerRegistry,
          strictPlatformMatching: envs.isCI(),
        });
      }
      await buildBinary();
      if (pushDocker) {
        core.publishDockerImages({
          ids,
          pushTo: opts.dockerPushTo,
          strictPlatformMatching: envs.isCI(),
        });
      }
      break;
    }

    case "target": {
      const { channel, docker, binary, remote } = scenario;
      const addr = resolveDockerAddresses(channel, opts);

      // BUILD (descriptor not written yet).
      if (docker) {
        core.buildDockerImages({ ids, registry: addr.pull, strictPlatformMatching: envs.isCI() });
      }
      if (binary) await buildBinary();

      // PUSH when the target is remote (still no descriptor on disk).
      if (docker && remote) {
        core.publishDockerImages({ ids, pushTo: addr.push, strictPlatformMatching: envs.isCI() });
      }
      if (binary && remote) {
        // storageURL falls through to the engine, which resolves the dev/release endpoint.
        await core.publishPackages({ ids, storageURL: opts.storageUrl });
      }
      break;
    }

    default:
      util.assertNever(scenario);
  }

  // DESCRIPTOR LAST — only after build + push have succeeded.
  core.buildSwJsonFiles({ packageIds: ids });
}

function buildModeFor(scenario: Scenario): util.BuildMode {
  if (scenario.kind !== "target") return "release";
  if (scenario.channel === "release") return "release";
  return scenario.binary && scenario.remote ? "dev-remote" : "dev-local";
}

// pl-pkg's tri-state flag resolution: explicit no-flag wins, then explicit yes-flag, else default.
function shouldDoAction(defaultValue: boolean, doFlag?: boolean, noDoFlag?: boolean): boolean {
  if (noDoFlag) return false;
  if (doFlag) return true;
  return defaultValue;
}

// Docker push target + the pull address embedded in the descriptor, for a channel target. The push
// URL carries the channel's built-in default (dev => the dev ECR, release => the artifact's own
// registry); the pull URL defaults to the push URL. Explicit --docker-registry/--docker-push-to win.
// (`ecr://`-scheme push URLs and the auto docker-login they trigger are handled separately — A-0044.)
function resolveDockerAddresses(
  channel: Channel,
  opts: BuildOptions,
): { pull?: string; push?: string } {
  const isDev = channel === "dev";
  const channelPush =
    process.env[isDev ? envs.PL_DEV_DOCKER_PUSH_URL : envs.PL_RELEASE_DOCKER_PUSH_URL];
  const channelPull =
    process.env[isDev ? envs.PL_DEV_DOCKER_PULL_URL : envs.PL_RELEASE_DOCKER_PULL_URL];

  const push =
    opts.dockerPushTo ?? channelPush ?? (isDev ? defaults.DEV_DOCKER_REGISTRY : undefined);
  const pull = opts.dockerRegistry ?? channelPull ?? push;
  return { pull, push };
}
