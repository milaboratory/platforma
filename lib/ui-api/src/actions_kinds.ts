import {
  ConfAction,
  ActionResult,
  InferVarTypeSafe,
  PlResourceEntry
} from './type_engine';
import { And, IsA, SyncConfAction } from './type_util';
import { LocalBlobHandle, RemoteBlobHandle } from './driver_types';

//
// Context
//

export interface ActGetFromCtx<V extends string> extends ConfAction {
  new: (x: this['ctx']) => InferVarTypeSafe<typeof x, V>;
  isSync: true;
}

//
// Isolate
//

export interface ActIsolate<Nested extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Nested, typeof x>;
  isSync: false;
}

//
// Json Constructors
//

export interface ActGetImmediate<T> extends ConfAction {
  new: () => T;
  isSync: true;
}

export interface ActMakeObject<T extends Record<string, ConfAction>> extends ConfAction {
  new: (x: this['ctx']) => {
    [Key in keyof T]: ActionResult<T[Key], typeof x>
  };
  isSync: IsA<T, Record<string, SyncConfAction>>;
}

export interface ActMakeArray<T extends ConfAction[]> extends ConfAction {
  new: (x: this['ctx']) => {
    [Key in keyof T]: ActionResult<T[Key], typeof x>
  };
  isSync: IsA<T, SyncConfAction[]>;
}

//
// Json Transformers
//

export interface ActGetField<Source extends ConfAction, Field extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => InferVarTypeSafe<
    ActionResult<Source, typeof x>,
    ActionResult<Field, typeof x>>;
  isSync: true;
}

export interface ActMapRecordValues<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends Record<string, infer V>
    ? Record<string, ActionResult<Mapping, (typeof x) & { [K in ItVar]: V }>>
    : unknown;
  isSync: And<IsA<Source, SyncConfAction>, IsA<Mapping, SyncConfAction>>;
}

export interface ActMapArrayValues<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends (infer V)[]
    ? ActionResult<Mapping, (typeof x) & { [K in ItVar]: V }>[]
    : unknown;
  isSync: And<IsA<Source, SyncConfAction>, IsA<Mapping, SyncConfAction>>;
}

export interface ActFlatten<Sources extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Sources, typeof x> extends (infer V)[][]
    ? V[]
    : unknown;
  isSync: IsA<Sources, SyncConfAction[]>;
}

//
// Boolean
//

export interface ActIsEmpty<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends (unknown[] | string | undefined)
    ? boolean
    : unknown,
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActNot<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends boolean
    ? boolean
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActAnd<Source1 extends ConfAction, Source2 extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source1, typeof x> extends boolean
    ? (ActionResult<Source2, typeof x> extends boolean
      ? boolean
      : unknown)
    : unknown;
  isSync: IsA<Source1, SyncConfAction> & IsA<Source2, SyncConfAction>;
}

export interface ActOr<Source1 extends ConfAction, Source2 extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source1, typeof x> extends boolean
    ? (ActionResult<Source2, typeof x> extends boolean
      ? boolean
      : unknown)
    : unknown;
  isSync: IsA<Source1, SyncConfAction> & IsA<Source2, SyncConfAction>;
}

//
// Resource
//

export interface ActGetResourceField<Source extends ConfAction, Field extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? ActionResult<Field, typeof x> extends string
      ? PlResourceEntry
      : unknown
    : unknown;
  isSync: And<IsA<Source, SyncConfAction>, IsA<Field, SyncConfAction>>;
}

export interface ActMapResourceFields<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? Record<string, ActionResult<Mapping, (typeof x) & { [K in ItVar]: PlResourceEntry }>>
    : unknown;
  isSync: And<IsA<Source, SyncConfAction>, IsA<Mapping, SyncConfAction>>;
}

//
// Resource To Json
//

export interface ActGetResourceValueAsJson<Source extends ConfAction, T> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? T
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

//
// Download Blobs
//

export interface ActGetBlobContent<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? Uint8Array
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActGetBlobContentAsString<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? string
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActGetBlobContentAsJson<Source extends ConfAction, T> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? T
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActGetDownloadedBlobContent<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? LocalBlobHandle
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}

export interface ActGetOnDemandBlobContent<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? RemoteBlobHandle
    : unknown;
  isSync: IsA<Source, SyncConfAction>;
}
