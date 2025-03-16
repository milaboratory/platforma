import type { PColumnSpec, PlRef } from '@milaboratories/pl-model-common';
import { AnchorCtx, isPColumnSpec, isPlRef } from '@milaboratories/pl-model-common';
import type { RenderCtx } from '../api';
import type { LabelDerivationOps } from './label';
import { deriveLabels } from './label';

/**
 * Calculates anchored identifier options for columns matching a given predicate.
 *
 * This function filters column specifications from the result pool that match the provided predicate,
 * creates a standardized AnchorCtx from the provided anchors, and generates a list of label-value
 * pairs for UI components (like dropdowns).
 *
 * @param ctx - The render context providing access to the result pool and specification data.
 * @param anchorsOrCtx - Either:
 *                     - An existing AnchorCtx instance
 *                     - A record mapping anchor IDs to PColumnSpec objects
 *                     - A record mapping anchor IDs to PlRef objects (which will be resolved to PColumnSpec)
 * @param predicate - A function that determines which PColumnSpec objects to include in the results.
 *                    Only specs that return true will be included.
 * @param labelOps - Optional configuration for label generation:
 *                 - includeNativeLabel: Whether to include native column labels
 *                 - separator: String to use between label parts (defaults to " / ")
 *                 - addLabelAsSuffix: Whether to add labels as suffix instead of prefix
 * @returns An array of objects with `label` (display text) and `value` (anchored ID string) properties,
 *          or undefined if any PlRef resolution fails.
 */
// Overload for AnchorCtx - guaranteed to never return undefined
export function generateAnchoredColumnOptions(
  ctx: RenderCtx<unknown, unknown>,
  anchorsOrCtx: AnchorCtx,
  predicate: (spec: PColumnSpec) => boolean,
  labelOps?: LabelDerivationOps,
): { label: string; value: string }[];

// Overload for Record<string, PColumnSpec> - guaranteed to never return undefined
export function generateAnchoredColumnOptions(
  ctx: RenderCtx<unknown, unknown>,
  anchorsOrCtx: Record<string, PColumnSpec>,
  predicate: (spec: PColumnSpec) => boolean,
  labelOps?: LabelDerivationOps,
): { label: string; value: string }[];

// Overload for Record<string, PColumnSpec | PlRef> - may return undefined if PlRef resolution fails
export function generateAnchoredColumnOptions(
  ctx: RenderCtx<unknown, unknown>,
  anchorsOrCtx: Record<string, PColumnSpec | PlRef>,
  predicate: (spec: PColumnSpec) => boolean,
  labelOps?: LabelDerivationOps,
): { label: string; value: string }[] | undefined;

// Implementation
export function generateAnchoredColumnOptions(
  ctx: RenderCtx<unknown, unknown>,
  anchorsOrCtx: AnchorCtx | Record<string, PColumnSpec | PlRef>,
  predicate: (spec: PColumnSpec) => boolean,
  labelOps?: LabelDerivationOps,
): { label: string; value: string }[] | undefined {
  const filtered = ctx.resultPool.getSpecs().entries.filter(({ obj: spec }) => isPColumnSpec(spec) && predicate(spec));

  // Handle PlRef objects by resolving them to PColumnSpec
  const resolvedAnchors: Record<string, PColumnSpec> = {};

  if (!(anchorsOrCtx instanceof AnchorCtx)) {
    for (const [key, value] of Object.entries(anchorsOrCtx)) {
      if (isPlRef(value)) {
        const resolvedSpec = ctx.resultPool.getPColumnSpecByRef(value);
        if (!resolvedSpec)
          return undefined;
        resolvedAnchors[key] = resolvedSpec;
      } else {
        // It's already a PColumnSpec
        resolvedAnchors[key] = value as PColumnSpec;
      }
    }
  }

  const anchorCtx = anchorsOrCtx instanceof AnchorCtx
    ? anchorsOrCtx
    : new AnchorCtx(resolvedAnchors);

  return deriveLabels(filtered, (o) => o.obj, labelOps ?? {}).map(({ value: { obj: spec }, label }) => ({
    value: anchorCtx.deriveAIdString(spec as PColumnSpec)!,
    label,
  }));
}
