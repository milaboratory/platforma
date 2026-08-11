// Guard against the silent "image built, never pushed" outcome.
//
// Docker auto-push defaults to `isCI() && !isPrivate`, but the entrypoint
// descriptor is written with the image tag either way. A stray
// `"private": true` on a software package therefore yields a green CI run and
// a published block that 404s pulling its image at runtime — the failure only
// surfaces when a user runs the block (MILAB-6714).
//
// So: in CI, building docker images without pushing them is an error unless
// the caller says it meant to, via `--docker-no-autopush` /
// `PL_DOCKER_NO_AUTOPUSH=1`.

import * as envs from "./envs";
import * as util from "./util";

export type PushIntent = {
  /** Docker images were built in this run. */
  buildDocker: boolean;
  /** Resolved auto-push decision. */
  pushDocker: boolean;
  /** Caller passed `--docker-no-autopush` / `PL_DOCKER_NO_AUTOPUSH=1`. */
  pushDisabledExplicitly: boolean;
  /** How many entrypoints produce a docker image. */
  dockerPackageCount: number;
};

/** Throws when a CI run is about to reference docker images it never pushed. */
export function assertDockerPushIntent(intent: PushIntent): void {
  if (!envs.isCI()) return;
  if (!intent.buildDocker || intent.pushDocker) return;
  if (intent.dockerPackageCount === 0) return;
  if (intent.pushDisabledExplicitly) return;

  throw util.CLIError(
    `This CI run would build docker images without pushing them, while still writing ` +
      `entrypoint descriptors that reference them. Consumers would fail to pull the images.\n` +
      `  The usual cause is "private": true in package.json: auto-push is gated on ` +
      `!isPrivate, and software packages must never be private.\n` +
      `  If this package really must build images without publishing them, say so with ` +
      `--docker-no-autopush (or ${envs.PL_DOCKER_NO_AUTOPUSH}=1).`,
  );
}
