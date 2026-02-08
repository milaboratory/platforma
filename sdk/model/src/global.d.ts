import type { Platforma, PlatformaApiVersion } from "./platforma";

declare global {
  /** Global factory method returning platforma instance */
  var getPlatforma: PlatformaSDKVersion; // TODO: invalid type
  var platforma: undefined | Platforma;
  var platformaApiVersion: PlatformaApiVersion;

  function getEnvironmentValue(name: string): string | undefined;

  /** Global rendering context, present only in rendering environment */
  var cfgRenderCtx: GlobalCfgRenderCtx;
}

export {};
