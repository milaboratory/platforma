import type { BlockApiV1 } from "./block_api_v1";
import type { BlockApiV2 } from "./block_api_v2";
import type { BlockApiV3 } from "./block_api_v3";
import type {
  BlockOutputsBase,
  BlockStateV3,
  DriverKit,
  OutputWithStatus,
} from "@milaboratories/pl-model-common";
import type { SdkInfo } from "./version";
import type { BlockStatePatch } from "./block_state_patch";
import type { PluginInstance } from "./block_model";

/** Defines all methods to interact with the platform environment from within a block UI. @deprecated */
export interface PlatformaV1<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>
  extends BlockApiV1<Args, Outputs, UiState, Href>, DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
  readonly apiVersion?: 1;
}

/** V2 version based on effective json patches pulling API */
export interface PlatformaV2<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>
  extends BlockApiV2<Args, Outputs, UiState, Href>, DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
  readonly apiVersion: 2;
}

export interface PlatformaV3<
  Data = unknown,
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
>
  extends BlockApiV3<Data, Args, Outputs, Href>, DriverKit {
  /** Information about SDK version current platforma environment was compiled with. */
  readonly sdkInfo: SdkInfo;
  readonly apiVersion: 3;
  /** @internal Type brand for plugin type inference. Not used at runtime. */
  readonly __pluginsBrand?: Plugins;
}

export type Platforma<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  UiStateOrData = unknown,
  Href extends `/${string}` = `/${string}`,
> =
  | PlatformaV1<Args, Outputs, UiStateOrData, Href>
  | PlatformaV2<Args, Outputs, UiStateOrData, Href>
  | PlatformaV3<UiStateOrData, Args, Outputs, Href>;

export type PlatformaExtended<Pl extends Platforma = Platforma> = Pl & {
  blockModelInfo: BlockModelInfo;
};

export type BlockModelInfo = {
  outputs: Record<
    string,
    {
      withStatus: boolean;
    }
  >;
};

export type PlatformaApiVersion = Platforma["apiVersion"];

export type InferArgsType<Pl extends Platforma> = Pl extends Platforma<infer Args> ? Args : never;

export type InferOutputsType<Pl extends Platforma> =
  Pl extends Platforma<unknown, infer Outputs> ? Outputs : never;

export type InferUiState<Pl extends Platforma> =
  Pl extends Platforma<unknown, Record<string, OutputWithStatus<unknown>>, infer UiState>
    ? UiState
    : never;

export type InferDataType<Pl extends Platforma> =
  Pl extends Platforma<unknown, Record<string, OutputWithStatus<unknown>>, infer Data>
    ? Data
    : never;

export type InferHrefType<Pl extends Platforma> =
  Pl extends Platforma<unknown, BlockOutputsBase, unknown, infer Href> ? Href : never;

export type PlatformaFactory = (config: { sdkVersion: string }) => Platforma;

export type InferBlockState<Pl extends Platforma> = BlockStateV3<
  InferDataType<Pl>,
  InferOutputsType<Pl>,
  InferHrefType<Pl>
>;

export type InferBlockStatePatch<Pl extends Platforma> = BlockStatePatch<
  InferArgsType<Pl>,
  InferOutputsType<Pl>,
  InferUiState<Pl>,
  InferHrefType<Pl>
>;

/** Extract plugin IDs as a string literal union from a Platforma type. */
export type InferPluginNames<Pl> =
  Pl extends PlatformaV3<any, any, any, any, infer P> ? string & keyof P : never;

/** Extract the Data type for a specific plugin by its ID. */
export type InferPluginData<Pl, PluginId extends string> =
  Pl extends PlatformaV3<any, any, any, any, infer P>
    ? PluginId extends keyof P
      ? P[PluginId] extends PluginInstance<infer D, any, any>
        ? D
        : never
      : never
    : never;
