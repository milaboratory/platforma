// import { FieldData, isNotNullResourceId, ResourceData, ResourceKind } from '../core/types';
// import { AnyFieldRef, AnyResourceRef, PlTransaction, ResourceRef } from '../core/transaction';
// import { notEmpty } from '../util/util';
//
// export type Serde<V> = {
//   ser: (obj: V) => Uint8Array
//   des: (data: Uint8Array) => V
// }
//
// const DummySerde: Serde<never> = {
//   ser: () => {
//     throw new Error();
//   },
//   des: () => {
//     throw new Error();
//   }
// };
//
// const NoSerde = { serde: DummySerde };
//
// export type StructuralSmartResourceKind = 'structural' | 'ephemeral'
// export type SmartResourceKind = StructuralSmartResourceKind | 'value'
//
// export type SmartResourceType<Kind extends ResourceKind, Name extends string,
//   Version extends string, Value = never> =
//   {
//     kind: Kind,
//     smartKind: SmartResourceKind,
//     name: Name,
//     version: Version,
//     serde: Serde<Value>
//   }
//
// export type AnySmartResourceType = SmartResourceType<ResourceKind, string, string, unknown>
// export type AnyStructuralSmartResourceType = SmartResourceType<'Structural', string, string, unknown>
//
// export type SmartFieldType<
//   Parent extends AnyStructuralSmartResourceType,
//   Ref extends AnyStructuralSmartResourceType> =
//   {
//     parent: Parent,
//     name: string,
//     referenced: Ref
//   }
//
// export type AnySmartFieldType = SmartFieldType<AnyStructuralSmartResourceType, AnyStructuralSmartResourceType>;
//
// export function structuralValueSRT<Name extends string, Version extends string, Value>(
//   smartKind: SmartResourceKind,
//   name: Name,
//   version: Version,
//   serde: Serde<Value>
// ): SmartResourceType<'Structural', Name, Version, Value> {
//   return { kind: 'Structural', smartKind, name, version, serde };
// }
//
// export function structuralSRT<Name extends string, Version extends string>(
//   smartKind: SmartResourceKind,
//   name: Name,
//   version: Version
// ): SmartResourceType<'Structural', Name, Version, never> {
//   return { kind: 'Structural', smartKind, name, version, serde: DummySerde };
// }
//
// export function valueSRT<Name extends string, Version extends string, Value>(
//   name: Name,
//   version: Version,
//   serde: Serde<Value>
// ): SmartResourceType<'Value', Name, Version, Value> {
//   return { kind: 'Value', smartKind: 'value', name, version, serde };
// }
//
// export function smartFields<
//   Parent extends AnyStructuralSmartResourceType,
//   Ref extends AnyStructuralSmartResourceType>(
//   parent: Parent,
//   name: string,
//   referenced: Ref
// ): SmartFieldType<Parent, Ref> {
//   return { parent, name, referenced };
// }
//
// export type GetValueType<ST extends AnySmartResourceType> =
//   ST extends SmartResourceType<ResourceKind, string, string, infer X> ? X : never
//
// export type GetRef<SF extends AnySmartFieldType> =
//   SF extends SmartFieldType<AnyStructuralSmartResourceType, infer X> ? X : never
//
// export type GetParent<SF extends AnySmartFieldType> =
//   SF extends SmartFieldType<infer X, AnyStructuralSmartResourceType> ? X : never
//
// export class SmartStructuralResourceAccessor<ST extends AnyStructuralSmartResourceType> {
//   constructor(public readonly type: ST,
//               public readonly ref: AnyResourceRef,
//               public readonly tx: PlTransaction) {
//   }
//
//   private _resourceData?: Promise<ResourceData>;
//
//   public async getResourceData(): Promise<ResourceData> {
//     if (this._resourceData === undefined)
//       this._resourceData = this.tx.getResourceData(this.ref, true);
//     return await this._resourceData;
//   }
//
//   public async getValue(): Promise<GetValueType<ST>> {
//     return this.type.serde.des(notEmpty((await this.getResourceData()).data)) as GetValueType<ST>;
//   }
//
//   public getField<SF extends SmartFieldType<ST, AnyStructuralSmartResourceType>>(field: SF): Promise<GetValueType<ST>> {
//     return new SmartFieldAccessor(field, { resourceId: this.ref, fieldName: field.name }, this.tx);
//   }
//
// }
//
// export class SmartFieldAccessor<SF extends AnySmartFieldType> {
//   constructor(public readonly descriptor: SF,
//               public readonly ref: AnyFieldRef,
//               public readonly tx: PlTransaction) {
//   }
//
//   public parent(): SmartStructuralResourceAccessor<GetParent<SF>> {
//     return new SmartStructuralResourceAccessor(
//       this.descriptor.parent as GetParent<SF>,
//       this.ref.resourceId, this.tx);
//   }
//
//   private _fieldData?: Promise<FieldData>;
//
//   public async getFieldData(): Promise<FieldData> {
//     if (this._fieldData === undefined)
//       this._fieldData = this.tx.getField(this.ref);
//     return await this._fieldData;
//   }
//
//
//   public async get(): SmartStructuralResourceAccessor<GetRef<SF>> {
//     const fieldData = await this.getFieldData();
//     if (isNotNullResourceId(fieldData.error))
//       throw new Error('Error in field.');
//     return new SmartStructuralResourceAccessor(
//       this.descriptor.referenced as GetRef<SF>,
//       fieldData.value,
//       this.tx);
//   }
// }
