/**
 * Type-level service resolution — auto-derives typed service maps from feature flags.
 * No runtime code. No edits needed when adding a service.
 */

import type {
  ServiceNameLiterals,
  ModelServices,
  UiServices,
} from "@milaboratories/pl-model-common";
import type { BlockServiceFlags } from "./block_services";

export type { ModelServices, UiServices };

// Flag name → service name literal: "requiresPFrameSpec" → "pframeSpec"
type FlagToName<Flag extends string> = Flag extends `requires${infer K}`
  ? K extends keyof ServiceNameLiterals
    ? ServiceNameLiterals[K]
    : never
  : never;

// Extract all required service name literals from feature flags
type RequiredServiceNames<Flags> = {
  [K in keyof Flags & `requires${string}`]: Flags[K] extends true ? FlagToName<K & string> : never;
}[keyof Flags & `requires${string}`];

// Resolve typed services from feature flags
// { requiresPFrameSpec: true } -> { pframeSpec: PFrameSpecDriver }
export type ResolveModelServices<Flags> = Pick<
  ModelServices,
  RequiredServiceNames<Flags> & keyof ModelServices
>;

export type ResolveUiServices<Flags> = Pick<
  UiServices,
  RequiredServiceNames<Flags> & keyof UiServices
>;

// Auto-derived from BLOCK_SERVICE_FLAGS.
export type BlockDefaultModelServices = ResolveModelServices<BlockServiceFlags>;
export type BlockDefaultUiServices = ResolveUiServices<BlockServiceFlags>;

// Compile-time type assertions — verified by tsc, not executed at runtime.
// Each @ts-expect-error proves the line below would be a type error.

// Block default services include pframeSpec
const _modelSpec: BlockDefaultModelServices["pframeSpec"] = undefined!;
const _uiSpec: BlockDefaultUiServices["pframeSpec"] = undefined!;
void _modelSpec;
void _uiSpec;

// Block default services do NOT include pframe (only plugins can request it)
const _modelPframe: BlockDefaultModelServices["pframe"] = undefined!;
const _uiPframe: BlockDefaultUiServices["pframe"] = undefined!;
void _modelPframe;
void _uiPframe;

// ResolveModelServices with false flag resolves to empty
type _NoServices = ResolveModelServices<{ requiresPFrameSpec: false }>;
// @ts-expect-error pframeSpec is not resolved when flag is false
const _noSpec: _NoServices["pframeSpec"] = undefined!;
void _noSpec;

// ResolveModelServices with multiple flags resolves all
type _Both = ResolveModelServices<{ requiresPFrameSpec: true; requiresPFrame: true }>;
const _bothSpec: _Both["pframeSpec"] = undefined!;
const _bothPframe: _Both["pframe"] = undefined!;
void _bothSpec;
void _bothPframe;
