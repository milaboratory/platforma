import type { ValueOrErrors } from '@milaboratories/pl-model-common';
import {} from './global';
import { getPlatformaInstance } from './internal';
import type { Platforma } from './platforma';
import { PlatformaSDKVersion } from './version';

export function getRawPlatformaInstance<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(): Platforma<Args, Outputs, UiState, Href> {
  return getPlatformaInstance<Args, Outputs, UiState, Href>({ sdkVersion: PlatformaSDKVersion });
}

/** Returns a global platforma instance or a provided fallback if it's not available. */
export function getPlatformaOrDefault<
  Args = unknown,
  Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(platforma: Platforma<Args, Outputs, UiState, Href>): Platforma<Args, Outputs, UiState, Href> {
  try {
    return getRawPlatformaInstance<Args, Outputs, UiState, Href>();
  } catch {
    return platforma;
  }
}
