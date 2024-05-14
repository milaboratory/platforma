import { ResourceType } from './types';

//
// NOTE: This code is not used.
//       It shows a raw idea on how to implement typed Tx API
//

export type PlAnyStructuralResourceKind = 'structural' | 'ephemeral' | 'singleton'
export type PlResourceKind = PlAnyStructuralResourceKind | 'value';

declare const __resource_type: unique symbol;
export type WithRichType<T, B extends ResourceType> = T & { [__resource_type]: B }

export type Serde<V> = {
  ser: (obj: V) => Uint8Array
  des: (data: Uint8Array) => V
}

export type RichResourceType<Kind extends PlResourceKind,
  Name extends string, Version extends string, Value = never> =
  {
    kind: Kind,
    name: Name,
    version: Version,
    serde: Serde<Value>
  }

export type AnyStructuralRichResourceType = RichResourceType<PlAnyStructuralResourceKind, string, string, unknown>

const DummySerde: Serde<never> = {
  ser: (t) => {
    throw new Error();
  },
  des: (t) => {
    throw new Error();
  }
};

const NoSerde = { serde: DummySerde };

export function richStructuralType<
  Name extends string,
  Version extends string,
  Kind extends PlAnyStructuralResourceKind>(
  kind: Kind,
  name: Name,
  version: Version
): RichResourceType<Kind, Name, Version> {
  return { kind, name, version, ...NoSerde };
}

export function richValueType<
  Name extends string,
  Version extends string,
  Value>(
  name: Name,
  version: Version,
  serde: Serde<Value>
): RichResourceType<'value', Name, Version, Value> {
  return { kind: 'value', name, version, serde };
}

export type RichFieldType<
  Parent extends AnyStructuralRichResourceType,
  Name extends string,
  Ref extends AnyStructuralRichResourceType> =
  {
    parent: Parent,
    name: Name,
    referenced: Ref
  }

export function richFieldType<
  Parent extends AnyStructuralRichResourceType,
  Name extends string,
  Ref extends AnyStructuralRichResourceType>(
  parent: Parent,
  name: Name,
  referenced: Ref
): RichFieldType<Parent, Name, Ref> {
  return { parent, name, referenced };
}

const BContextEnd = richStructuralType('structural', 'BContextEnd', '1');
