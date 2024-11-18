declare global {
  /** Global factory method returning platforma instance */
  var getPlatforma: PlatformaSDKVersion;
  var platforma: Platforma;

  function getEnvironmentValue(name: string): string | undefined;

  /** Global rendering context, present only in rendering environment */
  var cfgRenderCtx: GlobalCfgRenderCtx;
}

export {};
