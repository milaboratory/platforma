import {
  ActGetField,
  ActGetFromCtx,
  ActGetImmediate,
  ActGetResourceField, ActGetResourceValueAsJson,
  ActMakeObject,
  ActMapRecordValues,
  ActMapResourceFields, ActMapArrayValues, ActIsEmpty, ActNot, ActIsolate, ActGetBlobContentAsJson, ActGetBlobContentAsString, ActGetBlobContent, ActAnd, ActOr
} from './actions_kinds';
import {
  ExtractAction,
  POCExtractAction,
  PrimitiveOrConfig,
  TypedConfig
} from './type_engine';
import { Cfg } from './model';
import { CheckedSyncConf } from './type_util';

//
// Helpers
//

function primitiveToConfig(value: PrimitiveOrConfig): TypedConfig {
  if ((typeof value) === 'string' || (typeof value) === 'number' || (typeof value) === 'boolean' || (value === null))
    return getImmediate(value);
  else
    return value as TypedConfig;
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
  cfg: Config
): TypedConfig<ActIsolate<ExtractAction<Config>>> {
  return ({
    type: 'Isolate', cfg
  } as Cfg) as any;
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

export function getJsonField<const Source extends PrimitiveOrConfig, const Field extends PrimitiveOrConfig>(
  source: Source, field: Field
): TypedConfig<ActGetField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return ({
    type: 'GetJsonField', source: primitiveToConfig(source), field: primitiveToConfig(field)
  } as Cfg) as any;
}

export function makeObject<const T extends Record<string, PrimitiveOrConfig>>(template: T):
TypedConfig<ActMakeObject<{ [Key in keyof T]: POCExtractAction<T[Key]> }>> {
  const normalizedTemplate: Record<string, TypedConfig> = {};
  for (const [k, cfg] of Object.entries(template))
    normalizedTemplate[k] = primitiveToConfig(cfg);
  return {
    type: 'MakeObject',
    template: normalizedTemplate
  } as Cfg as any;
}

export function mapRecordValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig>
  (source: Source & CheckedSyncConf<Source>, mapping: Mapping):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapRecordValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig>
  (source: Source, mapping: Mapping & CheckedSyncConf<Mapping>):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapRecordValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source & CheckedSyncConf<Source>, mapping: Mapping, itVar: ItVar):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapRecordValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping & CheckedSyncConf<Mapping>, itVar: ItVar):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapRecordValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping, itVar: ItVar = '$it' as ItVar):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
    return {
      type: 'MapRecordValues',
      source, mapping, itVar
    } as Cfg as any;
  }

export function mapArrayValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig>
  (source: Source & CheckedSyncConf<Source>, mapping: Mapping):
TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapArrayValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig>
  (source: Source, mapping: Mapping & CheckedSyncConf<Mapping>):
TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapArrayValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source & CheckedSyncConf<Source>, mapping: Mapping, itVar: ItVar):
TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapArrayValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping & CheckedSyncConf<Mapping>, itVar: ItVar):
TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapArrayValues<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping, itVar: ItVar = '$it' as ItVar):
TypedConfig<ActMapArrayValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
    return {
      type: 'MapArrayValues',
      source, mapping, itVar
    } as Cfg as any;
  }

//
// Boolean
//

export function isEmpty<const Arg extends TypedConfig>(
    arg: Arg
  ): TypedConfig<ActIsEmpty<ExtractAction<Arg>>> {
  return ({
    type: 'IsEmpty', arg
  } as Cfg) as any;
}

export function not<const Operand extends TypedConfig>(
  operand: Operand
): TypedConfig<ActNot<ExtractAction<Operand>>> {
  return ({
    type: 'Not', operand
  } as Cfg) as any;
}

export function and<const Operand1 extends TypedConfig, const Operand2 extends TypedConfig>(
  operand1: Operand1,
  operand2: Operand2,
): TypedConfig<ActAnd<ExtractAction<Operand1>, ExtractAction<Operand2>>> {
  return ({
    type: 'And', operand1, operand2
  } as Cfg) as any;
}

export function or<const Operand1 extends TypedConfig, const Operand2 extends TypedConfig>(
  operand1: Operand1,
  operand2: Operand2,
): TypedConfig<ActOr<ExtractAction<Operand1>, ExtractAction<Operand2>>> {
  return ({
    type: 'Or', operand1, operand2
  } as Cfg) as any;
}

//
// Resources
//

export function getResourceField<const Source extends PrimitiveOrConfig, const Field extends PrimitiveOrConfig>(
  source: Source, field: Field
): TypedConfig<ActGetResourceField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return ({
    type: 'GetResourceField', source: primitiveToConfig(source), field: primitiveToConfig(field)
  } as Cfg) as any;
}

export function getResourceValueAsJson<T>() {
  return function <const Source extends PrimitiveOrConfig>(
    source: Source
  ): TypedConfig<ActGetResourceValueAsJson<POCExtractAction<Source>, T>> {
    return ({
      type: 'GetResourceValueAsJson', source: primitiveToConfig(source)
    } as Cfg) as any;
  };
}

export function mapResourceFields<
  const Source extends TypedConfig,
const Mapping extends TypedConfig>
  (source: Source, mapping: Mapping):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapResourceFields<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping, itVar: ItVar):
TypedConfig<ActMapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapResourceFields<
  const Source extends TypedConfig,
const Mapping extends TypedConfig,
const ItVar extends string>
  (source: Source, mapping: Mapping, itVar: ItVar = '$it' as ItVar):
TypedConfig<ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
    return {
      type: 'MapResourceFields',
      source, mapping, itVar
    } as Cfg as TypedConfig<ActMapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
  }

//
// Download Blobs
//

export function getBlobContent() {
    return function <const Source extends PrimitiveOrConfig>(
      source: Source
    ): TypedConfig<ActGetBlobContent<POCExtractAction<Source>>> {
      return ({
        type: 'GetBlobContent', source: primitiveToConfig(source)
      } as Cfg) as any;
    };
  }

export function getBlobContentAsString() {
    return function <const Source extends PrimitiveOrConfig>(
      source: Source
    ): TypedConfig<ActGetBlobContentAsString<POCExtractAction<Source>>> {
      return ({
        type: 'GetBlobContentAsString', source: primitiveToConfig(source)
      } as Cfg) as any;
    };
  }

export function getBlobContentAsJson<T>() {
    return function <const Source extends PrimitiveOrConfig>(
    source: Source
  ): TypedConfig<ActGetBlobContentAsJson<POCExtractAction<Source>, T>> {
    return ({
      type: 'GetBlobContentAsJson', source: primitiveToConfig(source)
    } as Cfg) as any;
  };
}
