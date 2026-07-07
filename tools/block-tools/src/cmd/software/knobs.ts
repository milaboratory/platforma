export const channels = ["dev", "release"] as const;
export const variants = ["docker", "binary", "all", "none"] as const;
export const locations = ["local", "remote"] as const;

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

// The variant a resolved target actually builds — "none" is its own scenario, never a target.
export type TargetVariant = Exclude<Variant, "none">;

// The closed set of supported scenarios — the single resolved representation runBuild executes.
// Anything outside it is rejected by parseScenario. The `target` cell keeps the knobs as enums
// (like `channel`), rather than pre-derived booleans, so all three axes read consistently;
// runBuild derives the docker/binary/remote flags it needs.
export type Scenario =
  | { kind: "use-published" } // build-against-existing: descriptor only, no build/push
  | { kind: "no-software" } // placeholder descriptors, nothing built or pushed
  | { kind: "legacy" } // no location knob: bare `pl-pkg build` behaviour (docker push gated by CI)
  | { kind: "target"; channel: Channel; variant: TargetVariant; location: Location };

// Validate the raw knobs and collapse them to a supported scenario. The one place unsupported
// combinations are rejected.
export function parseScenario(knobs: Knobs): Scenario {
  if (knobs.usePublished) {
    // Build-against-existing references an already-published *binary* artifact; docker (and `all`,
    // which includes docker) has no published-reference path.
    if (knobs.variant === "docker" || knobs.variant === "all") {
      throw new Error(
        `--use-published is binary-only and cannot be combined with --variant ${knobs.variant}`,
      );
    }
    return { kind: "use-published" };
  }

  // Placeholder descriptors only, nothing built or pushed; location is ignored.
  if (knobs.variant === "none") {
    return { kind: "no-software" };
  }

  // No location: the bare invocation, a drop-in for `pl-pkg build`.
  if (knobs.location === undefined) {
    return { kind: "legacy" };
  }

  // `all` (the default when unset) builds every declared variant; the engine skips the kinds the
  // software omits.
  return {
    kind: "target",
    channel: knobs.channel ?? "release",
    variant: knobs.variant ?? "all",
    location: knobs.location,
  };
}
