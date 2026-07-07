import { util } from "@platforma-sdk/package-builder-lib";

export const channels = ["dev", "release"] as const;
export const variants = ["docker", "binary", "all", "none"] as const;
export const locations = ["local", "remote"] as const;

export type Channel = (typeof channels)[number];
export type Variant = (typeof variants)[number];
export type Location = (typeof locations)[number];

// Raw CLI flags, each independently optional; parseScenario narrows them to a supported Scenario.
export type Knobs = {
  channel?: Channel;
  variant?: Variant;
  location?: Location;
  usePublished?: boolean;
};

// The variant a resolved target actually builds — "none" is its own scenario, never a target.
export type TargetVariant = Exclude<Variant, "none">;

// The closed set of scenarios runBuild executes; parseScenario rejects anything else. `target`
// carries the resolved knobs as enums (not pre-derived booleans) — runBuild derives the flags.
export type Scenario =
  // `build:dev-binary-existing` (PL_BUILD_USE_PUBLISHED): reference the published binary; no build/push.
  | { kind: "binary-existing" }
  // `build:dev-no-software` (PL_BUILD_VARIANT=none): placeholder descriptors; nothing built or pushed.
  | { kind: "no-software" }
  // no build:* script — the scriptless default (direct call / `do-pack`); drop-in `pl-pkg build`.
  | { kind: "bare" }
  // `build:dev-local` / `build:dev-remote` / `build:release` / `test`: build for a target.
  | { kind: "target"; channel: Channel; variant: TargetVariant; location: Location };

// Collapse the raw knobs to a supported Scenario; the one place bad combinations are rejected.
export function parseScenario(knobs: Knobs): Scenario {
  if (knobs.usePublished) {
    // A published binary can be referenced; docker (and `all`, which includes it) cannot.
    if (knobs.variant === "docker" || knobs.variant === "all") {
      throw util.CLIError(
        `--use-published is binary-only and cannot be combined with --variant ${knobs.variant}`,
      );
    }
    return { kind: "binary-existing" };
  }

  if (knobs.variant === "none") {
    return { kind: "no-software" };
  }

  if (knobs.location === undefined) {
    return { kind: "bare" };
  }

  // `all` (the default) builds every declared variant; the engine skips the kinds the software omits.
  return {
    kind: "target",
    channel: knobs.channel ?? "release",
    variant: knobs.variant ?? "all",
    location: knobs.location,
  };
}
