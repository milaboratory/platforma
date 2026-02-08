import type {
  BlockRenderingMode,
  BlockSection,
  AnyFunction,
  PlRef,
  BlockCodeKnownFeatureFlags,
  BlockConfigContainer,
} from "@milaboratories/pl-model-common";
import type { Checked, ConfigResult, TypedConfig } from "./config";
import { getImmediate } from "./config";
import { getPlatformaInstance, isInUI, tryRegisterCallback } from "./internal";
import type { Platforma, PlatformaApiVersion, PlatformaV1, PlatformaV2 } from "./platforma";
import type { InferRenderFunctionReturn, RenderFunctionLegacy } from "./render";
import { RenderCtxLegacy } from "./render";
import { PlatformaSDKVersion } from "./version";
import type {
  TypedConfigOrConfigLambda,
  ConfigRenderLambda,
  StdCtxArgsOnly,
  DeriveHref,
  ConfigRenderLambdaFlags,
  InferOutputsFromConfigs,
} from "./bconfig";
import { downgradeCfgOrLambda, isConfigLambda } from "./bconfig";
import type { PlatformaExtended } from "./platforma";

type SectionsExpectedType = readonly BlockSection[];

type SectionsCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends SectionsExpectedType ? true : false
>;

type InputsValidExpectedType = boolean;

type InputsValidCfgChecked<Cfg extends TypedConfig, Args, UiState> = Checked<
  Cfg,
  ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>> extends InputsValidExpectedType ? true : false
>;

type NoOb = Record<string, never>;

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module. */
export class BlockModel<
  Args,
  OutputsCfg extends Record<string, TypedConfigOrConfigLambda>,
  UiState,
  Href extends `/${string}` = "/",
> {
  private constructor(
    private config: {
      readonly renderingMode: BlockRenderingMode;
      readonly initialArgs?: Args;
      readonly initialUiState: UiState;
      readonly outputs: OutputsCfg;
      readonly inputsValid: TypedConfigOrConfigLambda;
      readonly sections: TypedConfigOrConfigLambda;
      readonly title?: ConfigRenderLambda;
      readonly subtitle?: ConfigRenderLambda;
      readonly tags?: ConfigRenderLambda;
      readonly enrichmentTargets?: ConfigRenderLambda;
      readonly featureFlags: BlockCodeKnownFeatureFlags;
    },
  ) {}

  public static get INITIAL_BLOCK_FEATURE_FLAGS(): BlockCodeKnownFeatureFlags {
    return {
      supportsLazyState: true,
      requiresUIAPIVersion: 1,
      requiresModelAPIVersion: 1,
    };
  }

  /** Initiates configuration builder */
  public static create(renderingMode: BlockRenderingMode): BlockModel<NoOb, {}, NoOb>;
  /** Initiates configuration builder */
  public static create(): BlockModel<NoOb, {}, NoOb>;
  /**
   * Initiates configuration builder
   * @deprecated use create method without generic parameter
   */
  public static create<Args>(renderingMode: BlockRenderingMode): BlockModel<Args, {}, NoOb>;
  /**
   * Initiates configuration builder
   * @deprecated use create method without generic parameter
   */
  public static create<Args>(): BlockModel<Args, {}, NoOb>;
  public static create(renderingMode: BlockRenderingMode = "Heavy"): BlockModel<NoOb, {}, NoOb> {
    return new BlockModel<NoOb, {}, NoOb>({
      renderingMode,
      initialUiState: {},
      outputs: {},
      inputsValid: getImmediate(true),
      sections: getImmediate([]),
      featureFlags: BlockModel.INITIAL_BLOCK_FEATURE_FLAGS,
    });
  }

  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param cfg configuration describing how to render cell value from the blocks
   *            workflow outputs
   * @deprecated use lambda-based API
   * */
  public output<const Key extends string, const Cfg extends TypedConfig>(
    key: Key,
    cfg: Cfg,
  ): BlockModel<Args, OutputsCfg & { [K in Key]: Cfg }, UiState, Href>;
  /**
   * Add output cell wrapped with additional status information to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunctionLegacy<Args, UiState>>(
    key: Key,
    rf: RF,
    flags: ConfigRenderLambdaFlags & { withStatus: true },
  ): BlockModel<
    Args,
    OutputsCfg & {
      [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> & { withStatus: true };
    },
    UiState,
    Href
  >;
  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunctionLegacy<Args, UiState>>(
    key: Key,
    rf: RF,
    flags?: ConfigRenderLambdaFlags,
  ): BlockModel<
    Args,
    OutputsCfg & { [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> },
    UiState,
    Href
  >;
  public output(
    key: string,
    cfgOrRf: TypedConfig | AnyFunction,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    if (typeof cfgOrRf === "function") {
      const handle = `output#${key}`;
      tryRegisterCallback(handle, () => cfgOrRf(new RenderCtxLegacy()));
      return new BlockModel({
        ...this.config,
        outputs: {
          ...this.config.outputs,
          [key]: {
            __renderLambda: true,
            handle,
            ...flags,
          },
        },
      });
    } else {
      return new BlockModel({
        ...this.config,
        outputs: {
          ...this.config.outputs,
          [key]: cfgOrRf,
        },
      });
    }
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<
    const Key extends string,
    const RF extends RenderFunctionLegacy<Args, UiState>,
  >(key: Key, rf: RF) {
    return this.output(key, rf, { retentive: true });
  }

  /** Shortcut for {@link output} with withStatus flag set to true. */
  public outputWithStatus<
    const Key extends string,
    const RF extends RenderFunctionLegacy<Args, UiState>,
  >(key: Key, rf: RF) {
    return this.output(key, rf, { withStatus: true });
  }

  /** Shortcut for {@link output} with retentive and withStatus flags set to true. */
  public retentiveOutputWithStatus<
    const Key extends string,
    const RF extends RenderFunctionLegacy<Args, UiState>,
  >(key: Key, rf: RF) {
    return this.output(key, rf, { retentive: true, withStatus: true });
  }

  /** Sets custom configuration predicate on the block args at which block can be executed
   * @deprecated use lambda-based API */
  public argsValid<Cfg extends TypedConfig>(
    cfg: Cfg & InputsValidCfgChecked<Cfg, Args, UiState>,
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  /** Sets custom configuration predicate on the block args at which block can be executed */
  public argsValid<RF extends RenderFunctionLegacy<Args, UiState, boolean>>(
    rf: RF,
  ): BlockModel<Args, OutputsCfg, UiState, Href>;
  public argsValid(
    cfgOrRf: TypedConfig | AnyFunction,
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (typeof cfgOrRf === "function") {
      tryRegisterCallback("inputsValid", () => cfgOrRf(new RenderCtxLegacy()));
      return new BlockModel<Args, OutputsCfg, UiState>({
        ...this.config,
        inputsValid: {
          __renderLambda: true,
          handle: "inputsValid",
        },
      });
    } else {
      return new BlockModel<Args, OutputsCfg, UiState>({
        ...this.config,
        inputsValid: cfgOrRf,
      });
    }
  }

  /** Sets the config to generate list of section in the left block overviews panel
   * @deprecated use lambda-based API */
  public sections<const S extends SectionsExpectedType>(
    rf: S,
  ): BlockModel<Args, OutputsCfg, UiState, DeriveHref<S>>;
  /** Sets the config to generate list of section in the left block overviews panel */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunctionLegacy<Args, UiState, Ret>,
  >(rf: RF): BlockModel<Args, OutputsCfg, UiState, DeriveHref<ReturnType<RF>>>;
  public sections<const Cfg extends TypedConfig>(
    cfg: Cfg & SectionsCfgChecked<Cfg, Args, UiState>,
  ): BlockModel<
    Args,
    OutputsCfg,
    UiState,
    DeriveHref<ConfigResult<Cfg, StdCtxArgsOnly<Args, UiState>>>
  >;
  public sections(
    arrOrCfgOrRf: SectionsExpectedType | TypedConfig | AnyFunction,
  ): BlockModel<Args, OutputsCfg, UiState, `/${string}`> {
    if (Array.isArray(arrOrCfgOrRf)) {
      return this.sections(getImmediate(arrOrCfgOrRf));
    } else if (typeof arrOrCfgOrRf === "function") {
      tryRegisterCallback("sections", () => arrOrCfgOrRf(new RenderCtxLegacy()));
      return new BlockModel<Args, OutputsCfg, UiState>({
        ...this.config,
        sections: {
          __renderLambda: true,
          handle: "sections",
        },
      });
    } else {
      return new BlockModel<Args, OutputsCfg, UiState>({
        ...this.config,
        sections: arrOrCfgOrRf as TypedConfig,
      });
    }
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunctionLegacy<Args, UiState, string>,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback("title", () => rf(new RenderCtxLegacy()));
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      title: {
        __renderLambda: true,
        handle: "title",
      },
    });
  }

  public subtitle(
    rf: RenderFunctionLegacy<Args, UiState, string>,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback("subtitle", () => rf(new RenderCtxLegacy()));
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      subtitle: {
        __renderLambda: true,
        handle: "subtitle",
      },
    });
  }

  public tags(
    rf: RenderFunctionLegacy<Args, UiState, string[]>,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback("tags", () => rf(new RenderCtxLegacy()));
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      tags: {
        __renderLambda: true,
        handle: "tags",
      },
    });
  }

  /**
   * Sets initial args for the block, this value must be specified.
   * @deprecated use {@link withArgs}
   * */
  public initialArgs(value: Args): BlockModel<Args, OutputsCfg, UiState, Href> {
    return this.withArgs(value);
  }

  /** Sets initial args for the block, this value must be specified. */
  public withArgs<Args>(initialArgs: Args): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      initialArgs,
    });
  }

  /** Defines type and sets initial value for block UiState. */
  public withUiState<UiState>(
    initialUiState: UiState,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      initialUiState,
    });
  }

  /** Sets or overrides feature flags for the block. */
  public withFeatureFlags(
    flags: Partial<BlockCodeKnownFeatureFlags>,
  ): BlockModel<Args, OutputsCfg, UiState, Href> {
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      featureFlags: {
        ...this.config.featureFlags,
        ...flags,
      },
    });
  }

  /**
   * Defines how to derive list of upstream references this block is meant to enrich with its exports from block args.
   * Influences dependency graph construction.
   */
  public enriches(lambda: (args: Args) => PlRef[]): BlockModel<Args, OutputsCfg, UiState, Href> {
    tryRegisterCallback("enrichmentTargets", lambda);
    return new BlockModel<Args, OutputsCfg, UiState, Href>({
      ...this.config,
      enrichmentTargets: {
        __renderLambda: true,
        handle: "enrichmentTargets",
      },
    });
  }

  public done(
    apiVersion?: 1,
  ): PlatformaExtended<
    PlatformaV1<Args, InferOutputsFromConfigs<Args, OutputsCfg, UiState>, UiState, Href>
  >;

  public done(
    apiVersion: 2,
  ): PlatformaExtended<
    PlatformaV2<Args, InferOutputsFromConfigs<Args, OutputsCfg, UiState>, UiState, Href>
  >;

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block state, and
   * other features provided by the platforma to the block. */
  public done(
    apiVersion: PlatformaApiVersion = 1,
  ): PlatformaExtended<
    Platforma<Args, InferOutputsFromConfigs<Args, OutputsCfg, UiState>, UiState, Href>
  > {
    return this.withFeatureFlags({
      ...this.config.featureFlags,
      requiresUIAPIVersion: apiVersion,
    }).#done();
  }

  #done(): PlatformaExtended<
    Platforma<Args, InferOutputsFromConfigs<Args, OutputsCfg, UiState>, UiState, Href>
  > {
    if (this.config.initialArgs === undefined) throw new Error("Initial arguments not set.");

    const config: BlockConfigContainer = {
      v4: undefined,
      v3: {
        configVersion: 3,
        modelAPIVersion: 1,
        sdkVersion: PlatformaSDKVersion,
        renderingMode: this.config.renderingMode,
        initialArgs: this.config.initialArgs,
        initialUiState: this.config.initialUiState,
        inputsValid: this.config.inputsValid,
        sections: this.config.sections,
        title: this.config.title,
        subtitle: this.config.subtitle,
        tags: this.config.tags,
        outputs: this.config.outputs,
        enrichmentTargets: this.config.enrichmentTargets,
        featureFlags: this.config.featureFlags,
      },

      // fields below are added to allow previous desktop versions read generated configs
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this.config.renderingMode,
      initialArgs: this.config.initialArgs,
      inputsValid: downgradeCfgOrLambda(this.config.inputsValid),
      sections: downgradeCfgOrLambda(this.config.sections),
      outputs: Object.fromEntries(
        Object.entries(this.config.outputs).map(([key, value]) => [
          key,
          downgradeCfgOrLambda(value),
        ]),
      ),
    };

    globalThis.platformaApiVersion = this.config.featureFlags
      .requiresUIAPIVersion as PlatformaApiVersion;

    if (!isInUI())
      // we are in the configuration rendering routine, not in actual UI
      return { config } as any;
    // normal operation inside the UI
    else
      return {
        ...getPlatformaInstance({
          sdkVersion: PlatformaSDKVersion,
          apiVersion: platformaApiVersion,
        }),
        blockModelInfo: {
          outputs: Object.fromEntries(
            Object.entries(this.config.outputs).map(([key, value]) => [
              key,
              {
                withStatus: Boolean(isConfigLambda(value) && value.withStatus),
              },
            ]),
          ),
        },
      };
  }
}
