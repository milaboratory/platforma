import {
  util,
  envs,
  defaults,
  type Builder,
  type Logger,
} from "@platforma-sdk/package-builder-lib";
import type { Channel, Scenario } from "./knobs";
import { ensureAwsProfile, ensureEcrLogin } from "./ecr-login";

// Pass-through controls mirroring `pl-pkg build`. Empty means "engine default". The --docker-/
// --conda- flag pairs are already collapsed to decisions at the CLI boundary (build.ts): only the
// `bare` scenario reads buildDocker/pushDocker; condaBuild applies to every binary build.
export type BuildOptions = {
  ids?: string[];
  force?: boolean;
  contentRoot?: string;
  storageUrl?: string;
  dockerRegistry?: string;
  dockerPushTo?: string;
  buildDocker?: boolean;
  pushDocker?: boolean;
  condaBuild?: boolean;
};

// Build a scenario in one pass: build, push when remote, then write the descriptor last —
// "ready ⟺ the descriptor exists". The pre-configured builder is injected; runBuild sets the
// scenario's build mode and drives it.
export async function runBuild(params: {
  core: Builder;
  scenario: Scenario;
  options?: BuildOptions;
  logger?: Logger;
}): Promise<void> {
  const { core, scenario, options: opts = {}, logger } = params;
  const ids = opts.ids;
  core.buildMode = buildModeForScenario(scenario);

  const buildBinary = () =>
    core.buildSoftwareArchives({
      ids,
      forceBuild: Boolean(opts.force),
      contentRoot: opts.contentRoot,
      // Tolerate a package with no archives only on a build-all run; when specific ids are
      // requested, an empty build is a real error the caller wants to hear about.
      skipIfEmpty: !ids,
      condaBuild: opts.condaBuild,
    });

  switch (scenario.kind) {
    case "binary-existing":
      // Descriptor points at an already-published release artifact; nothing is built or pushed.
      core.writePublishedArtifactInfo({ ids });
      break;

    case "no-software":
      // Nothing built or pushed; the placeholder descriptor is written below.
      break;

    case "bare": {
      // Bare pl-pkg-parity invocation; buildDocker/pushDocker were resolved at the CLI boundary.
      if (opts.buildDocker) {
        core.buildDockerImages({
          ids,
          registry: opts.dockerRegistry,
          strictPlatformMatching: envs.isCI(),
        });
      }
      await buildBinary();
      if (opts.pushDocker) {
        core.publishDockerImages({
          ids,
          pushTo: opts.dockerPushTo,
          strictPlatformMatching: envs.isCI(),
        });
      }
      break;
    }

    case "target": {
      const { channel, variant, location } = scenario;
      const docker = variant !== "binary";
      const binary = variant !== "docker";
      const remote = location === "remote";
      const addr = resolveDockerAddresses(channel, opts);

      // BUILD (descriptor not written yet).
      if (docker) {
        core.buildDockerImages({ ids, registry: addr.pull, strictPlatformMatching: envs.isCI() });
      }
      if (binary) await buildBinary();

      // PUSH when remote. Pin the AWS credential chain once (docker login + S3 upload share it), but
      // only for dev — the fallback profile is the dev SSO one.
      if (remote && channel === "dev" && (docker || binary)) ensureAwsProfile(logger);
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

function buildModeForScenario(scenario: Scenario): util.BuildMode {
  if (scenario.kind !== "target") return "release";
  if (scenario.channel === "release") return "release";
  // Only a remote binary build needs dev-remote (it uploads an archive). Docker-only, or any
  // local build, uses dev-local — docker naming is content-addressed by image ID regardless.
  const binaryRemote = scenario.variant !== "docker" && scenario.location === "remote";
  return binaryRemote ? "dev-remote" : "dev-local";
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

// Docker push target + the pull address embedded in the descriptor. Precedence flag > channel env >
// dev default (release has none). Pull default is channel-specific: dev pulls from where it pushed
// (one ECR host), but release push (quay) and pull (containers.pl-open.science, GA-fronted proxy) are
// different locations by design, so release pull defaults to the built-in registry, NOT the push
// target. autoLogin follows the push target's ecr://.
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

  const rawPull =
    opts.dockerRegistry ?? channelPull ?? (isDev ? rawPush : defaults.DOCKER_REGISTRY);
  const pull = rawPull ? stripScheme(rawPull) : undefined;

  return { pull, push: parsed.registry, autoLogin: parsed.autoLogin };
}
