import type { OutputWithStatus } from "@milaboratories/pl-model-common";
import { getPlatformaInstance } from "./internal";
import type { Platforma, PlatformaApiVersion } from "./platforma";
import { PlatformaSDKVersion } from "./version";

export function getPlatformaApiVersion(): PlatformaApiVersion {
  return platformaApiVersion ?? 1; // undefined means 1 for backward compatibility
}

export function getRawPlatformaInstance<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(): Platforma<Args, Outputs, UiState, Href> {
  return getPlatformaInstance<Args, Outputs, UiState, Href>({
    sdkVersion: PlatformaSDKVersion,
    apiVersion: platformaApiVersion,
  });
}

/** Returns a global platforma instance or a provided fallback if it's not available. */
// export function getPlatformaOrDefault<
//   Args = unknown,
//   Outputs extends Record<string, ValueOrErrors<unknown>> = Record<string, ValueOrErrors<unknown>>,
//   UiState = unknown,
//   Href extends `/${string}` = `/${string}`,
// >(): PlatformaV1<Args, Outputs, UiState, Href> | PlatformaV2<Args, Outputs, UiState, Href> {
//   try {
//     return getRawPlatformaInstance<Args, Outputs, UiState, Href>();
//   } catch {
//     return platforma;
//   }
// }
