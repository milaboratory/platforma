import { util } from "@platforma-sdk/package-builder-lib";

export const channels = ["dev", "release"] as const;
export const variants = ["docker", "binary"] as const;
export const locations = ["local", "remote", "ssh"] as const;

export type Channel = (typeof channels)[number];
export type Variant = (typeof variants)[number];
export type Location = (typeof locations)[number];

// Raw CLI surface: three orthogonal flags + a mode switch, each independently optional
// (commander hands them over one by one, env-backed). parseScenario narrows this open
// space to the closed set of scenarios the tool actually supports.
export interface Knobs {
  channel?: Channel;
  variant?: Variant;
  location?: Location;
  usePublished?: boolean;
}

// The closed set of supported scenarios. Anything outside it is rejected by parseScenario,
// so planFor only ever sees a buildable case.
export type Scenario =
  | { kind: "use-published" } // build-against-existing: descriptor only, no build/push
  | { kind: "legacy" } // no location knob: reproduce `pl-pkg build` (docker push gated by CI)
  | { kind: "target"; channel: Channel; docker: boolean; binary: boolean; remote: boolean };

export interface BuildPlan {
  buildMode: util.BuildMode;
  isDev: boolean; // dev channel => docker pushes to the built-in dev registry
  buildDocker: boolean;
  buildBinary: boolean;
  pushDocker: boolean;
  uploadBinary: boolean;
  usePublished: boolean;
  isCIDefaultPush: boolean; // legacy mode => docker push follows the CI default (pl-pkg parity)
}

// Validate the raw knobs and collapse them to a supported scenario. The one place unsupported
// combinations are rejected.
export function parseScenario(knobs: Knobs): Scenario {
  if (knobs.usePublished) {
    if (knobs.variant === "docker") {
      throw new Error(
        "--use-published is binary-only and cannot be combined with --variant docker",
      );
    }
    return { kind: "use-published" };
  }

  if (knobs.location === "ssh") {
    throw new Error("location 'ssh' is not implemented yet");
  }

  // No location: the bare `block-tools software build` invocation, kept a drop-in for `pl-pkg build`.
  if (knobs.location === undefined) {
    return { kind: "legacy" };
  }

  // Unset variant acts per-entrypoint (both kinds), matching pl-pkg.
  return {
    kind: "target",
    channel: knobs.channel ?? "release",
    docker: knobs.variant !== "binary",
    binary: knobs.variant !== "docker",
    remote: knobs.location === "remote",
  };
}

// Total mapping from a supported scenario to its build plan.
export function planFor(scenario: Scenario): BuildPlan {
  switch (scenario.kind) {
    case "use-published":
      return {
        buildMode: "release",
        isDev: false,
        buildDocker: false,
        buildBinary: false,
        pushDocker: false,
        uploadBinary: false,
        usePublished: true,
        isCIDefaultPush: false,
      };

    case "legacy":
      return {
        buildMode: "release",
        isDev: false,
        buildDocker: true,
        buildBinary: true,
        pushDocker: false,
        uploadBinary: false,
        usePublished: false,
        isCIDefaultPush: true,
      };

    case "target": {
      const { channel, docker, binary, remote } = scenario;
      const buildMode: util.BuildMode =
        channel === "release"
          ? "release"
          : binary && remote
            ? "dev-remote" // the only cell that builds+uploads a dev binary
            : "dev-local";

      return {
        buildMode,
        isDev: channel === "dev",
        buildDocker: docker,
        buildBinary: binary,
        pushDocker: docker && remote,
        uploadBinary: binary && remote,
        usePublished: false,
        isCIDefaultPush: false,
      };
    }

    default:
      throw util.assertNever(scenario);
  }
}
