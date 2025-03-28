import type { ActGetImmediate } from './actions_kinds';
import type { Cfg } from './model';

// Higher kind types pattern taken from here: https://code.lol/post/programming/higher-kinded-types/

type GenericFunction = (x: any) => unknown;

/** This is a type constructor deriving a returned type of config given the
 * context type. Something like ConfAction<Cfg> -> ReturnedType.  */
export interface ConfAction {
  readonly ctx: unknown;
  new: GenericFunction;
  isSync: boolean;
}

/** This type basically sets parameter to a ConfAction kind. */
export type ActionResult<A extends ConfAction, Ctx> = ReturnType<
  (A & {
    readonly ctx: Ctx;
  })['new']
>;

// Branding pattern taken from here: https://egghead.io/blog/using-branded-types-in-typescript

/** Field key to attach ConfAction information to a config type. */
declare const __config_action__: unique symbol;

/** Creates branded Cfg type */
export type TypedConfig<Action extends ConfAction = ConfAction> = Cfg & {
  [__config_action__]: Action;
};

export type PrimitiveOrConfig = TypedConfig | string | number | boolean | null;

/** Converts primitive types to immediate config */
export type PrimitiveToCfg<T extends PrimitiveOrConfig> = T extends string | number | boolean | null
  ? TypedConfig<ActGetImmediate<T>>
  : T;

/** Extracts action */
export type ExtractAction<Cfg extends TypedConfig> = Cfg[typeof __config_action__];

export type POCExtractAction<T extends PrimitiveOrConfig> = ExtractAction<PrimitiveToCfg<T>>;

export type InferVarTypeSafe<Ctx, V> = V extends string
  ? Ctx extends { [key in V]: infer T }
    ? T
    : undefined
  : unknown;

export type ConfigResult<Cfg extends TypedConfig, Ctx> = ActionResult<ExtractAction<Cfg>, Ctx>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const plResourceEntry: unique symbol;

/** Marks that a certain variable in context is a resource entry */
export type PlResourceEntry = typeof plResourceEntry;

export type OptionalPlResourceEntry = PlResourceEntry | undefined;
