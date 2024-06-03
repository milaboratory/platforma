import { ConfAction, ActionResult, InferVarTypeSafe, PlResourceEntry } from './type_engine';

export interface GetFromCtx<V extends string> extends ConfAction {
  new: (x: this['ctx']) => InferVarTypeSafe<typeof x, V>;
}

//
// Json
//

export interface GetImmediate<T> extends ConfAction {
  new: () => T;
}

export interface GetField<Source extends ConfAction, Field extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => InferVarTypeSafe<
    ActionResult<Source, typeof x>,
    ActionResult<Field, typeof x>>;
}

export interface MakeObject<T extends Record<string, ConfAction>> extends ConfAction {
  new: (x: this['ctx']) => {
    [Key in keyof T]: ActionResult<T[Key], typeof x>
  };
}

export interface MapRecordValues<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends Record<string, infer V>
    ? Record<string, ActionResult<Mapping, (typeof x) & { [K in ItVar]: V }>>
    : unknown;
}

export interface MapArrayValues<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends (infer V)[]
    ? ActionResult<Mapping, (typeof x) & { [K in ItVar]: V }>[]
    : unknown;
}

//
// Boolean
//

export interface IsEmpty<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends unknown[]
    ? boolean
    : unknown;
}

export interface Not<Source extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends boolean
    ? boolean
    : unknown;
}

//
// Resource
//

export interface GetResourceField<Source extends ConfAction, Field extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? ActionResult<Field, typeof x> extends string
      ? PlResourceEntry
      : unknown
    : unknown;
}

export interface MapResourceFields<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? Record<string, ActionResult<Mapping, (typeof x) & { [K in ItVar]: PlResourceEntry }>>
    : unknown;
}

//
// Resource To Json
//

export interface GetResourceValueAsJson<Source extends ConfAction, T> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? T
    : unknown;
}
