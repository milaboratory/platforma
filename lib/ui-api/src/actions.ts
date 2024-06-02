import {
  GetField,
  GetFromCtx,
  GetImmediate,
  GetResourceField, GetResourceValueAsJson,
  MakeObject,
  MapRecordValues,
  MapResourceFields
} from './actions_kinds';
import {
  ExtractAction,
  POCExtractAction,
  PrimitiveOrConfig,
  TypedConfig
} from './type_engine';
import { Cfg } from './dto';

function primitiveToConfig(value: PrimitiveOrConfig): TypedConfig {
  if ((typeof value) === 'string' || (typeof value) === 'number' || (typeof value) === 'boolean' || (value === null))
    return getImmediate(value);
  else
    return value as TypedConfig;
}

export function getFromCfg<const V extends string>(variable: V): TypedConfig<GetFromCtx<V>> {
  return { type: 'GetFromCtx', variable } as Cfg as any;
}

export function getImmediate<const T>(value: T): TypedConfig<GetImmediate<T>> {
  return { type: 'Immediate', value } as Cfg as any;
}

export function getJsonField<const Source extends PrimitiveOrConfig, const Field extends PrimitiveOrConfig>(
  source: Source, field: Field
): TypedConfig<GetField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return ({
    type: 'GetJsonField', field, source
  } as Cfg) as any;
}

export function makeObject<const T extends Record<string, PrimitiveOrConfig>>(template: T):
  TypedConfig<MakeObject<{ [Key in keyof T]: POCExtractAction<T[Key]> }>> {
  return {
    type: 'MakeObject',
    template
  } as Cfg as any;
}

export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig>
(source: Source, mapping: Mapping):
  TypedConfig<MapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string>
(source: Source, mapping: Mapping, itVar: ItVar):
  TypedConfig<MapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapRecordValues<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string>
(source: Source, mapping: Mapping, itVar: ItVar = '$it' as ItVar):
  TypedConfig<MapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
  return {
    type: 'MapRecordValues',
    source, mapping, itVar
  } as Cfg as any;
}

export function getResourceField<const Source extends PrimitiveOrConfig, const Field extends PrimitiveOrConfig>(
  source: Source, field: Field
): TypedConfig<GetResourceField<POCExtractAction<Source>, POCExtractAction<Field>>> {
  return ({
    type: 'GetResourceField', field, source
  } as Cfg) as any;
}

export function getResourceValueAsJson<T>() {
  return function <const Source extends PrimitiveOrConfig>(
    source: Source
  ): TypedConfig<GetResourceValueAsJson<POCExtractAction<Source>, T>> {
    return ({
      type: 'GetResourceValueAsJson', source
    } as Cfg) as any;
  };
}

export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig>
(source: Source, mapping: Mapping):
  TypedConfig<MapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, '$it'>>
export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string>
(source: Source, mapping: Mapping, itVar: ItVar):
  TypedConfig<MapRecordValues<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>
export function mapResourceFields<
  const Source extends TypedConfig,
  const Mapping extends TypedConfig,
  const ItVar extends string>
(source: Source, mapping: Mapping, itVar: ItVar = '$it' as ItVar):
  TypedConfig<MapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>> {
  return {
    type: 'MapResourceFields',
    source, mapping, itVar
  } as Cfg as TypedConfig<MapResourceFields<ExtractAction<Source>, ExtractAction<Mapping>, ItVar>>;
}

export const Inputs = getFromCfg('$inputs');
export const It = getFromCfg('$it');
export const Outputs = getFromCfg('$outputs');
