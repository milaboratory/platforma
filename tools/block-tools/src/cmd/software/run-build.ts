import {
  util,
  envs,
  defaults,
  type Builder,
  type Logger,
} from "@platforma-sdk/package-builder-lib";
import type { Channel, Scenario } from "./knobs";
import { ensureAwsProfile, ensureEcrLogin } from "./ecr-login";

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
  logger?: Logger,
): Promise<void> {
  const ids = opts.ids;
  core.buildMode = buildModeFor(scenario);

  const buildBinary = () =>
    core.buildSoftwareArchives({
      ids,
      forceBuild: Boolean(opts.force),
      contentRoot: opts.contentRoot,
      skipIfEmpty: Boolean(ids),
      condaBuild: util.shouldDoAction(true, opts.condaBuild, opts.condaNoBuild),
    });

  switch (scenario.kind) {
    case "use-published":
      // Descriptor points at an already-published release artifact; nothing is built or pushed.
      core.writePublishedArtifactInfo({ ids });
      break;

    case "no-software":
      // Nothing built or pushed; the placeholder descriptor is written below.
      break;

    case "legacy": {
      // Bare pl-pkg-parity invocation: docker build/push follow the CI default + flags.
      const buildDocker = util.shouldDoAction(envs.isCI(), opts.dockerBuild, opts.dockerNoBuild);
      const pushDocker =
        buildDocker &&
        util.shouldDoAction(
          envs.isCI() && !core.isPrivate,
          opts.dockerAutopush,
          opts.dockerNoAutopush,
        );

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

      // PUSH when remote. Select the AWS credential chain once (docker login + S3 upload share it).
      if (remote && (docker || binary)) ensureAwsProfile(logger);
      if (docker && remote) {
        if (addr.autoLogin && addr.push) await ensureEcrLogin(addr.push, logger);
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
  core.buildSwJsonFiles({ packageIds: ids, noSoftware: scenario.kind === "no-software" });
}

function buildModeFor(scenario: Scenario): util.BuildMode {
  if (scenario.kind !== "target") return "release";
  if (scenario.channel === "release") return "release";
  return scenario.binary && scenario.remote ? "dev-remote" : "dev-local";
}

// Bare registry ref (host[:port]/path) with any URL scheme removed.
function stripScheme(raw: string): string {
  if (!raw.includes("://")) return raw; // already bare
  const url = new URL(raw);
  return url.host + url.pathname;
}

// A push target may carry a scheme selecting auto docker-login: `ecr://` opts in, anything else out.
function parsePushTarget(raw: string): { registry: string; autoLogin: boolean } {
  return { registry: stripScheme(raw), autoLogin: raw.startsWith("ecr://") };
}

// Docker push target + the descriptor's embedded pull address for a channel. Precedence: flag >
// channel env > dev built-in default (release has none); pull defaults to push. `autoLogin` follows
// the push target's ecr:// scheme.
function resolveDockerAddresses(
  channel: Channel,
  opts: BuildOptions,
): { pull?: string; push?: string; autoLogin: boolean } {
  const isDev = channel === "dev";
  const channelPush =
    process.env[isDev ? envs.PL_DEV_DOCKER_PUSH_URL : envs.PL_RELEASE_DOCKER_PUSH_URL];
  const channelPull =
    process.env[isDev ? envs.PL_DEV_DOCKER_PULL_URL : envs.PL_RELEASE_DOCKER_PULL_URL];

  const rawPush =
    opts.dockerPushTo ?? channelPush ?? (isDev ? defaults.DEV_DOCKER_PUSH_TARGET : undefined);
  const parsed = rawPush ? parsePushTarget(rawPush) : { registry: undefined, autoLogin: false };

  const rawPull = opts.dockerRegistry ?? channelPull ?? rawPush;
  const pull = rawPull ? stripScheme(rawPull) : undefined;

  return { pull, push: parsed.registry, autoLogin: parsed.autoLogin };
}
