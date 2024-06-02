import { ConfAction, ActionResult, InferVarTypeSafe, PlResourceEntry } from './type_engine';

export interface GetFromCtx<V extends string> extends ConfAction {
  new: (x: this['ctx']) => InferVarTypeSafe<typeof x, V>;
}

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
    : never;
}

export interface GetResourceField<Source extends ConfAction, Field extends ConfAction> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? ActionResult<Field, typeof x> extends string
      ? PlResourceEntry
      : never
    : never;
}

export interface MapResourceFields<Source extends ConfAction, Mapping extends ConfAction, ItVar extends string> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? Record<string, ActionResult<Mapping, (typeof x) & { [K in ItVar]: PlResourceEntry }>>
    : never;
}

export interface GetResourceValueAsJson<Source extends ConfAction, T> extends ConfAction {
  new: (x: this['ctx']) => ActionResult<Source, typeof x> extends PlResourceEntry
    ? T
    : never;
}
