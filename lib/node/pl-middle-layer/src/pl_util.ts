import {
  AnyRef, field, FieldType, FutureFieldType,
  KnownResourceTypes,
  PlTransaction,
  ResourceId,
  ResourceRef,
  ResourceType
} from '@milaboratory/pl-ts-client-v2';
import { EphStdMap, StdMap } from './util';

export class KVAccessor<T> {
  constructor(public readonly resourceId: ResourceId,
              public readonly key: string,
              private readonly tx: PlTransaction) {
  }

  private loaded?: Promise<void>;
  private _value?: T;
  private _changed: boolean = false;

  public ensureLoadingStarted() {
    if (this.loaded === undefined)
      this.loaded = (async () => {
        const data = await this.tx.getKValueString(this.resourceId, this.key);
        this._value = JSON.parse(data) as T;
      })();
  }

  public async getReadonly() {
    this.ensureLoadingStarted();
    await this.loaded!;
    return this._value;
  }

  public async getForChange() {
    this._changed = true;
    return await this.getReadonly();
  }

  public flush() {
    if (this.loaded === undefined
      || !this._value === undefined
      || !this._changed)
      return;
    this.tx.setKValue(this.resourceId, this.key, JSON.stringify(this._value));
    this._changed = false;
  }
}

export function createTrue(tx: PlTransaction): ResourceRef {
  return tx.createValue(
    KnownResourceTypes.JsonBool,
    Buffer.from(JSON.stringify(true))
  );
}


export function pair<T1, T2>(v1: T1, v2: T2): [T1, T2] {
  return [v1, v2];
}

export type PlMapEntry = [string, AnyRef];

export function buildMap(tx: PlTransaction, entries: PlMapEntry[],
                         ephemeral: boolean, type?: ResourceType): ResourceRef {
  const actualType = type ?? (ephemeral ? EphStdMap : StdMap);
  const rId = ephemeral
    ? tx.createEphemeral(actualType)
    : tx.createStruct(actualType);

  entries.forEach(([name, value]) => {
    const f = field(rId, name);
    tx.createField(f, 'Input');
    tx.setField(f, value);
  });

  tx.lock(rId);

  return rId;
}

export function constructFutureFieldRecord<K extends string>(
  tx: PlTransaction, rId: AnyRef,
  keys: K[],
  fieldType: FutureFieldType): Record<K, AnyRef> {
  return Object.fromEntries(keys.map(k =>
    [k, tx.getFutureFieldValue(rId, k, fieldType)])) as Record<K, AnyRef>;
}

