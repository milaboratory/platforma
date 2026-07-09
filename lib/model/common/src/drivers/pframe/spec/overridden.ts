import { type Branded, throwError, type Mutable, Nil } from "@milaboratories/helpers";
import { type CanonicalizedJson, canonicalizeJson } from "../../../json";
import { AxisPatches, type ColumnUniversalId, parseColumnIdSafely } from "./ids";
import type { AxisSpec, PColumnSpec } from "./spec";
import { isNil, isString } from "es-toolkit";

export type SpecOverrides = Pick<PColumnSpec, "domain" | "contextDomain" | "annotations"> & {
  axesSpec?: AxisPatches;
};

/**
 * `source` can reference a leaf or a Filtered/Discovered id, but never another
 * Overridden id — there is no `Overridden<Overridden<...>>`. Repeated overrides
 * merge at the outer wrapper via {@link mergeSpecOverrides}.
 */
export interface ColumnOverriddenKey {
  __isOverridden: true;
  source: Exclude<ColumnUniversalId, ColumnOverriddenId>;
  specOverrides: SpecOverrides;
}

export type ColumnOverriddenId = Branded<
  CanonicalizedJson<ColumnOverriddenKey>,
  "ColumnOverriddenId"
>;

export function isColumnOverriddenKey(obj: unknown): obj is ColumnOverriddenKey {
  return typeof obj === "object" && obj !== null && "__isOverridden" in obj;
}

export function distillColumnOverriddenKey(props: ColumnOverriddenKey): ColumnOverriddenKey {
  return {
    __isOverridden: true,
    source: props.source,
    specOverrides: props.specOverrides,
  };
}

export function createColumnOverriddenId(props: {
  source: ColumnUniversalId;
  specOverrides: SpecOverrides;
}): ColumnOverriddenId {
  return stringifyColumnOverriddenId(createColumnOverriddenKey(props));
}

export function createColumnOverriddenKey(props: {
  source: ColumnUniversalId;
  specOverrides: SpecOverrides;
}): ColumnOverriddenKey {
  const { source, specOverrides } = props;
  const unwrapped = unwrapOverrides(source);
  const baseSource = unwrapped
    ? unwrapped.source
    : (source as Exclude<ColumnUniversalId, ColumnOverriddenId>);
  const mergedOverrides = unwrapped
    ? mergeSpecOverrides(unwrapped.specOverrides, specOverrides)
    : specOverrides;

  return {
    __isOverridden: true,
    source: baseSource,
    specOverrides: mergedOverrides,
  };
}

export function parseColumnOverriddenId(id: ColumnUniversalId): ColumnOverriddenKey {
  try {
    const parsed = JSON.parse(id);
    return isColumnOverriddenKey(parsed)
      ? parsed
      : throwError("Parsed object is not a valid OverriddenPColumn");
  } catch {
    throw new Error(
      "Invalid ColumnOverriddenId: not a valid JSON or does not conform to OverriddenPColumn structure",
    );
  }
}

export function stringifyColumnOverriddenId(id: ColumnOverriddenKey): ColumnOverriddenId {
  return canonicalizeJson<ColumnOverriddenKey>(
    distillColumnOverriddenKey(id),
  ) as ColumnOverriddenId;
}

/**
 * Peel one override-wrap layer.
 *
 * Invariant: `{source, specOverrides}` can only appear at the top level —
 * the inner `source` is never itself an override-wrap. Anything else throws.
 */
export function unwrapOverrides(id: ColumnUniversalId): ColumnOverriddenKey | undefined {
  const parsed = parseColumnIdSafely(id);
  if (parsed === undefined || !isColumnOverriddenKey(parsed)) return undefined;
  const inner = parseColumnIdSafely(parsed.source);
  if (inner !== undefined && isColumnOverriddenKey(inner)) {
    throw new Error("nested override-wrap detected — invariant broken");
  }
  return parsed;
}

/**
 * Diff two specs into a {@link SpecOverrides} patch that, when applied on top
 * of `base`, reconstructs `next`.
 *
 * - For top-level `annotations` / `domain` / `contextDomain`: include keys
 *   whose value in `next` differs from `base` (or is missing in `base`).
 *   Keys present in `base` but missing in `next` are not emitted — overrides
 *   merge, they cannot delete.
 * - For `axesSpec`: matched by **positional index**. Each `next[i]` is diffed
 *   against `base[i]`; only changed fields are emitted as a patch under key
 *   `i`. Indices past `base.length` carry the full new axis (append).
 */
export function deriveSpecDelta(base: PColumnSpec, next: PColumnSpec): SpecOverrides {
  const annotations = recordDelta(base.annotations, next.annotations);
  const domain = recordDelta(base.domain, next.domain);
  const contextDomain = recordDelta(base.contextDomain, next.contextDomain);
  const axesSpec = deriveAxesDelta(base.axesSpec, next.axesSpec);
  return {
    ...(axesSpec && { axesSpec }),
    ...(annotations && { annotations }),
    ...(domain && { domain }),
    ...(contextDomain && { contextDomain }),
  };
}

export function isEmptySpecDelta(delta: SpecOverrides): boolean {
  return (
    (!delta.annotations || Object.keys(delta.annotations).length === 0) &&
    (!delta.domain || Object.keys(delta.domain).length === 0) &&
    (!delta.contextDomain || Object.keys(delta.contextDomain).length === 0) &&
    (!delta.axesSpec || Object.keys(delta.axesSpec).length === 0)
  );
}

function deriveAxesDelta(
  base: readonly AxisSpec[],
  next: readonly AxisSpec[],
): AxisPatches | undefined {
  const out: AxisPatches = {};
  let any = false;
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    const b = base[i];
    if (b === undefined) {
      out[i] = a;
      any = true;
      continue;
    }
    const nameChanged = a.name !== b.name;
    const typeChanged = a.type !== b.type;
    const annotations = recordDelta(b.annotations, a.annotations);
    const domain = recordDelta(b.domain, a.domain);
    const contextDomain = recordDelta(b.contextDomain, a.contextDomain);
    if (!nameChanged && !typeChanged && !annotations && !domain && !contextDomain) continue;
    out[i] = {
      ...(nameChanged && { name: a.name }),
      ...(typeChanged && { type: a.type }),
      ...(annotations && { annotations }),
      ...(domain && { domain }),
      ...(contextDomain && { contextDomain }),
    };
    any = true;
  }
  return any ? out : undefined;
}

function recordDelta(
  base: Record<string, string> | undefined,
  next: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!next) return undefined;
  let any = false;
  const diff: Record<string, string> = {};
  for (const [k, v] of Object.entries(next)) {
    if (!base || base[k] !== v) {
      diff[k] = v;
      any = true;
    }
  }
  return any ? diff : undefined;
}

/**
 * Apply `specOverrides` from a rich id (`SUniversalPColumnId`) on top of a
 * resolved {@link PColumnSpec}. Returns `base` unchanged when the id carries
 * no overrides.
 */
export function applySpecOverrides(
  base: PColumnSpec,
  idOrOverride: Nil | SpecOverrides | ColumnUniversalId,
): PColumnSpec {
  if (isNil(idOrOverride)) {
    return base;
  }

  const overrides = isString(idOrOverride)
    ? unwrapOverrides(idOrOverride)?.specOverrides
    : idOrOverride;

  if (isNil(overrides)) {
    return base;
  }

  const result = { ...base };
  if (overrides.annotations)
    result.annotations = mergeRecord(base.annotations, overrides.annotations);
  if (overrides.domain) result.domain = mergeRecord(base.domain, overrides.domain);
  if (overrides.contextDomain)
    result.contextDomain = mergeRecord(base.contextDomain, overrides.contextDomain);
  if (overrides.axesSpec) result.axesSpec = applyAxesPatches(base.axesSpec, overrides.axesSpec);
  return result;
}

/**
 * Compose two override patches: applying `mergeSpecOverrides(prior, next)` on
 * top of a base spec produces the same result as applying `prior` then `next`.
 */
export function mergeSpecOverrides(prior: SpecOverrides, next: SpecOverrides): SpecOverrides {
  const result: Mutable<SpecOverrides> = {};
  const axesSpec = mergeAxesPatches(prior.axesSpec, next.axesSpec);
  if (axesSpec !== undefined) result.axesSpec = axesSpec;
  const annotations = mergeRecord(prior.annotations, next.annotations);
  if (annotations !== undefined) result.annotations = annotations;
  const domain = mergeRecord(prior.domain, next.domain);
  if (domain !== undefined) result.domain = domain;
  const contextDomain = mergeRecord(prior.contextDomain, next.contextDomain);
  if (contextDomain !== undefined) result.contextDomain = contextDomain;
  return result;
}

/**
 * Apply positional `patches` onto `base.axesSpec`. Patches deep-merge
 * `annotations` / `domain` / `contextDomain` and shallow-override `name` /
 * `type` at their slot. Indices `>= base.length` append new axes; intermediate
 * gaps (if any) are filled with the patch itself, so callers should not leave
 * holes between base.length and the highest patched index.
 */
function applyAxesPatches(base: readonly AxisSpec[], patches: AxisPatches): AxisSpec[] {
  const result: AxisSpec[] = base.slice();
  for (const [k, p] of Object.entries(patches)) {
    const i = Number(k);
    const existing = result[i];
    result[i] = (existing === undefined ? p : mergeAxisPatch(existing, p)) as AxisSpec;
  }
  return result;
}

/**
 * Compose two positional patch maps: `mergeAxesPatches(prior, next)` applied to
 * a base spec must equal applying `prior` then `next`. Patches sharing an
 * index deep-merge field-by-field.
 */
function mergeAxesPatches(
  prior: AxisPatches | undefined,
  next: AxisPatches | undefined,
): AxisPatches | undefined {
  if (!prior || Object.keys(prior).length === 0) return next;
  if (!next || Object.keys(next).length === 0) return prior;
  const result: AxisPatches = { ...prior };
  for (const [k, p] of Object.entries(next)) {
    const i = Number(k);
    const existing = result[i];
    result[i] = existing === undefined ? p : mergeAxisPatch(existing, p);
  }
  return result;
}

function mergeAxisPatch<A extends Partial<AxisSpec>>(axis: A, patch: Partial<AxisSpec>): A {
  const result: Mutable<A> = { ...axis, ...patch };
  if (patch.annotations) result.annotations = mergeRecord(axis.annotations, patch.annotations);
  if (patch.domain) result.domain = mergeRecord(axis.domain, patch.domain);
  if (patch.contextDomain) {
    result.contextDomain = mergeRecord(axis.contextDomain, patch.contextDomain);
  }
  return result;
}

function mergeRecord(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!b) return a;
  if (!a) return b;
  return { ...a, ...b };
}
