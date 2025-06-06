import type {
  ActGetField,
  ActGetFromCtx,
  ActGetImmediate,
  ActGetResourceField,
  ActGetResourceValueAsJson,
  ActMakeObject,
  ActMapRecordValues,
  ActMapResourceFields,
  ActMapArrayValues,
  ActIsEmpty,
  ActNot,
  ActIsolate,
  ActGetBlobContentAsJson,
  ActGetBlobContentAsString,
  ActGetBlobContent,
  ActAnd,
  ActOr,
  ActMakeArray,
  ActFlatten,
  ActGetDownloadedBlobContent,
  ActGetOnDemandBlobContent,
  ActImportProgress,
  ActGetLastLogs,
  ActGetProgressLog,
  ActGetProgressLogWithInfo,
  ActGetLogHandle,
  ActExtractArchiveAndGetURL,
} from './actions_kinds';
import type { ExtractAction, POCExtractAction, PrimitiveOrConfig, TypedConfig } from './type_engine';
import type { Cfg } from './model';
import type { CheckedSyncConf } from './type_util';
import type { ArchiveFormat, RangeBytes } from '@milaboratories/pl-model-common';

//
// Helpers
//

function primitiveToConfig(value: PrimitiveOrConfig): TypedConfig {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
  )
    return getImmediate(value);
  else return value as TypedConfig;
}

//
// Context
//

export function getFromCfg<const V extends string>(variable: V): TypedConfig<ActGetFromCtx<V>> {
  return { type: 'GetFromCtx', variable } as Cfg as any;
}

//
// Isolate
//

export function isolate<const Config extends TypedConfig>(
  cfg: Config,
): TypedConfig<ActIsolate<ExtractAction<Config>>> {
  return {
    type: 'Isolate',
    cfg,
  } as Cfg as any;
}

//
// Well-known Context Vars
//

export const Args = getFromCfg('$args');
export const It = getFromCfg('$it');
export const MainOutputs = getFromCfg('$prod');
export const StagingOutputs = getFromCfg('$staging');
export const UiState = getFromCfg('$ui');

//
// Json
//

export function getImmediate<const T>(value: T): TypedConfig<ActGetImmediate<T>> {
  return { type: 'Immediate', value } as Cfg as any;
}

export function makeObject<const T extends Record<string, PrimitiveOrConfig>>(
  template: T,
): TypedConfig<ActMakeObject<{ [Key in keyof T]: POCExtractAction<T[Key]> }>> {
  const normalizedTemplate: Record<string, TypedConfig> = {};
  for (const [k, cfg] of Object.entries(template)) normalizedTemplate[k] = primitiveToConfig(cfg);
  return {
    type: 'MakeObject',
    template: normalizedTemplate,
  } as Cfg as any;
}

export function makeArray<const T extends PrimitiveOrConfig[]>(
  ...template: T
): TypedConfig<ActMakeArray<{ [Key in keyof T]: POCExtractAction<T[Key]> }>> {
  const normalizedTemplate: TypedConfig[] = [];
  for (const cfg of template) normalizedTemplate.push(primitiveToConfig(cfg));
  return {
    type: 'MakeArray',
    template: normalizedTemplate,
  } as Cfg as any;
}

export function getJsonField<
  const Source extends PrimitiveOrConfig,
  const Field extends PrimitiveOrConfig,
>(
  source: Source,
  field: Field,
): TypedConfig<ActGetField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return {
    type: 'GetJsonField',
    source: primitiveToConfig(source),
    field: primitiveToConfig(field),
  } as Cfg as any;
}

export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
>(
  source: Source & CheckedSyncConf<Source>,
  mapping: Mapping
): TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>;
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
>(
  source: Source,
  mapping: Mapping & CheckedSyncConf<Mapping>
): TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>;
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source & CheckedSyncConf<Source>,
  mapping: Mapping,
  itVar: ItVar
): TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping & CheckedSyncConf<Mapping>,
  itVar: ItVar
): TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping,
  itVar: ItVar = '$it' as ItVar,
): TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
  return {
    type: 'MapRecordValues',
    source,
    mapping,
    itVar,
  } as Cfg as any;
}

export function mapArrayValues<const Source extends TypedConfig, const Mapping extends TypedConfig>(
  source: Source & CheckedSyncConf<Source>,
  mapping: Mapping
): TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>;
export function mapArrayValues<const Source extends TypedConfig, const Mapping extends TypedConfig>(
  source: Source,
  mapping: Mapping & CheckedSyncConf<Mapping>
): TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>;
export function mapArrayValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source & CheckedSyncConf<Source>,
  mapping: Mapping,
  itVar: ItVar
): TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
export function mapArrayValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping & CheckedSyncConf<Mapping>,
  itVar: ItVar
): TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
export function mapArrayValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping,
  itVar: ItVar = '$it' as ItVar,
): TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
  return {
    type: 'MapArrayValues',
    source,
    mapping,
    itVar,
  } as Cfg as any;
}

export function flatten<const Source extends TypedConfig>(
  source: Source,
): TypedConfig<ActFlatten<ExtractAction<Source>>> {
  return {
    type: 'Flatten',
    source,
  } as Cfg as any;
}

//
// Boolean
//

export function isEmpty<const Arg extends TypedConfig>(
  arg: Arg,
): TypedConfig<ActIsEmpty<ExtractAction<Arg>>> {
  return {
    type: 'IsEmpty',
    arg,
  } as Cfg as any;
}

export function not<const Operand extends TypedConfig>(
  operand: Operand,
): TypedConfig<ActNot<ExtractAction<Operand>>> {
  return {
    type: 'Not',
    operand,
  } as Cfg as any;
}

export function and<const Operand1 extends TypedConfig, const Operand2 extends TypedConfig>(
  operand1: Operand1,
  operand2: Operand2,
): TypedConfig<ActAnd<ExtractAction<Operand1>, ExtractAction<Operand2>>> {
  return {
    type: 'And',
    operand1,
    operand2,
  } as Cfg as any;
}

export function or<const Operand1 extends TypedConfig, const Operand2 extends TypedConfig>(
  operand1: Operand1,
  operand2: Operand2,
): TypedConfig<ActOr<ExtractAction<Operand1>, ExtractAction<Operand2>>> {
  return {
    type: 'Or',
    operand1,
    operand2,
  } as Cfg as any;
}

//
// Resources
//

export function getResourceField<
  const Source extends PrimitiveOrConfig,
  const Field extends PrimitiveOrConfig,
>(
  source: Source,
  field: Field,
): TypedConfig<ActGetResourceField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return {
    type: 'GetResourceField',
    source: primitiveToConfig(source),
    field: primitiveToConfig(field),
  } as Cfg as any;
}

export function getResourceValueAsJson<T>() {
  return function <const Source extends PrimitiveOrConfig>(
    source: Source,
  ): TypedConfig<ActGetResourceValueAsJson<POCExtractAction<Source>, T>> {
    return {
      type: 'GetResourceValueAsJson',
      source: primitiveToConfig(source),
    } as Cfg as any;
  };
}

export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
>(
  source: Source,
  mapping: Mapping
): TypedConfig<ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>;
export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping,
  itVar: ItVar
): TypedConfig<ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string,
>(
  source: Source,
  mapping: Mapping,
  itVar: ItVar = '$it' as ItVar,
): TypedConfig<ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
  return {
    type: 'MapResourceFields',
    source,
    mapping,
    itVar,
  } as Cfg as TypedConfig<
    ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>
  >;
}

//
// Download Blobs
//

export function getBlobContent<const Source extends TypedConfig>(
  source: Source,
  range?: RangeBytes,
): TypedConfig<ActGetBlobContent<ExtractAction<Source>>> {
  return {
    type: 'GetBlobContent',
    range,
    source: primitiveToConfig(source),
  } as Cfg as any;
}

export function getBlobContentAsString<const Source extends TypedConfig>(
  source: Source,
  range?: RangeBytes,
): TypedConfig<ActGetBlobContentAsString<ExtractAction<Source>>> {
  return {
    type: 'GetBlobContentAsString',
    range,
    source: primitiveToConfig(source),
  } as Cfg as any;
}

export function getBlobContentAsJson<T>() {
  return function <const Source extends TypedConfig>(
    source: Source,
    range?: RangeBytes,
  ): TypedConfig<ActGetBlobContentAsJson<ExtractAction<Source>, T>> {
    return {
      type: 'GetBlobContentAsJson',
      range,
      source: primitiveToConfig(source),
    } as Cfg as any;
  };
}

export function getDownloadedBlobContent<const Source extends TypedConfig>(
  source: Source,
): TypedConfig<ActGetDownloadedBlobContent<ExtractAction<Source>>> {
  return {
    type: 'GetDownloadedBlobContent',
    source: primitiveToConfig(source),
  } as Cfg as any;
}

export function getOnDemandBlobContent<const Source extends TypedConfig>(
  source: Source,
): TypedConfig<ActGetOnDemandBlobContent<ExtractAction<Source>>> {
  return {
    type: 'GetOnDemandBlobContent',
    source: primitiveToConfig(source),
  } as Cfg as any;
}

//
// Download Blobs to URLs
//

export function extractArchiveAndGetURL<const Source extends TypedConfig>(
  source: Source,
  format: ArchiveFormat,
): TypedConfig<ActExtractArchiveAndGetURL<ExtractAction<Source>>> {
  return {
    type: 'ExtractArchiveAndGetURL',
    format,
    source: primitiveToConfig(source),
  } as Cfg as any;
}

//
// Upload Blobs
//

export function getImportProgress<const Source extends TypedConfig>(
  source: Source,
): TypedConfig<ActImportProgress<ExtractAction<Source>>> {
  return {
    type: 'GetImportProgress',
    source: primitiveToConfig(source),
  } as Cfg as any;
}

//
// Logs
//

export function getLastLogs<const Source extends TypedConfig>(
  source: Source,
  lines: number,
): TypedConfig<ActGetLastLogs<ExtractAction<Source>>> {
  return {
    type: 'GetLastLogs',
    source: primitiveToConfig(source),
    lines,
  } as Cfg as any;
}

export function getProgressLog<const Source extends TypedConfig>(
  source: Source,
  patternToSearch: string,
): TypedConfig<ActGetProgressLog<ExtractAction<Source>>> {
  return {
    type: 'GetProgressLog',
    source: primitiveToConfig(source),
    patternToSearch,
  } as Cfg as any;
}

export function getProgressLogWithInfo<const Source extends TypedConfig>(
  source: Source,
  patternToSearch: string,
): TypedConfig<ActGetProgressLogWithInfo<ExtractAction<Source>>> {
  return {
    type: 'GetProgressLogWithInfo',
    source: primitiveToConfig(source),
    patternToSearch,
  } as Cfg as any;
}

export function getLogHandle<const Source extends TypedConfig>(
  source: Source,
): TypedConfig<ActGetLogHandle<ExtractAction<Source>>> {
  return {
    type: 'GetLogHandle',
    source: primitiveToConfig(source),
  } as Cfg as any;
}
