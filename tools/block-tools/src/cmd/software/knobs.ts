import { util } from "@platforma-sdk/package-builder-lib";

// The three target knobs of `software build`. Each is also accepted as an env var
// (see build.ts); the flag wins on conflict (commander resolves that).
export const channels = ["dev", "release"] as const;
export const variants = ["docker", "binary"] as const;
export const locations = ["local", "remote", "ssh"] as const;

export type Channel = (typeof channels)[number];
export type Variant = (typeof variants)[number];
export type Location = (typeof locations)[number];

export interface Knobs {
  channel?: Channel; // default: release
  variant?: Variant; // default: per-entrypoint (act on every artifact kind)
  location?: Location; // default: undefined => legacy pl-pkg behaviour (push only in CI)
  usePublished?: boolean; // build-against-existing: descriptor only, no build/push
}

// What the action should do, derived from the knobs. `buildMode` is the engine mode;
// the booleans gate the build/push steps. `usePublished` short-circuits to descriptor-only.
export interface BuildPlan {
  buildMode: util.BuildMode;
  buildDocker: boolean;
  buildBinary: boolean;
  pushDocker: boolean;
  uploadBinary: boolean;
  usePublished: boolean;
  isCIDefaultPush: boolean; // location unset => docker push follows the CI default (pl-pkg parity)
}

/**
 * Map the knobs to a concrete build plan. Pure — no env/CLI/engine access.
 *
 * Defaults reproduce today's `pl-pkg build`: channel=release, per-entrypoint variant,
 * location unset => build archives + (docker in CI) + push docker in CI, NO binary upload.
 * Explicit `location=remote` opts a target into pushing (binary upload + docker push).
 */
export function resolvePlan(knobs: Knobs): BuildPlan {
  const channel: Channel = knobs.channel ?? "release";

  if (knobs.location === "ssh") {
    throw new Error("location 'ssh' is not implemented yet");
  }

  if (knobs.usePublished) {
    // Binary only, no build, no push — descriptor points at the published release artifact.
    if (knobs.variant === "docker") {
      throw new Error(
        "--use-published is binary-only and cannot be combined with --variant docker",
      );
    }
    return {
      buildMode: "release",
      buildDocker: false,
      buildBinary: false,
      pushDocker: false,
      uploadBinary: false,
      usePublished: true,
      isCIDefaultPush: false,
    };
  }

  // Which artifact kinds to act on. Unset variant = per-entrypoint (both), matching pl-pkg.
  const doDocker = knobs.variant !== "binary";
  const doBinary = knobs.variant !== "docker";

  const remote = knobs.location === "remote";

  const buildMode: util.BuildMode =
    channel === "release"
      ? "release"
      : doBinary && remote
        ? "dev-remote" // the only cell that builds+uploads a dev binary
        : "dev-local";

  return {
    buildMode,
    buildDocker: doDocker,
    buildBinary: doBinary,
    pushDocker: doDocker && remote,
    uploadBinary: doBinary && remote,
    usePublished: false,
    // Legacy parity: when location is unset, docker build/push defer to the CI default.
    isCIDefaultPush: knobs.location === undefined,
  };
}
