export type AnyFunction = (...args: any[]) => any;

export type AnyAsyncFunction = (...args: any[]) => Promise<any>;

export type Optional<T> = T | undefined;

export type OneOrMany<T> = T | T[];

type _Resolve<T> = T;

export type Prettify<T> = _Resolve<{ [K in keyof T]: T[K] }>;

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type Expect<T extends true> = T;

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type MethodOf<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? K : never;
}[keyof T];

export type CallEvent<T extends Record<string, AnyFunction>> = {
  [P in keyof T]: {
    type: P;
    params: Parameters<T[P]>;
  };
}[keyof T];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Shift<A extends ReadonlyArray<unknown>> = A extends [infer V, ...infer L] ? L : never;

export type AsyncReturnType<T extends AnyFunction> = Promise<Awaited<ReturnType<T>>>;

export type AsyncReturnTypeOptional<T extends AnyFunction> = Promise<
  Awaited<ReturnType<T>> | undefined
>;

export type NonEmpty<T> = T extends null | undefined ? never : T;

export type Values<T> = T[keyof T];

export type ReturnValues<O extends Record<string, AnyFunction>> = Values<{
  [P in keyof O]: ReturnType<O[P]>;
}>;

export type Option<T = unknown> = {
  text: string;
  value: T;
};

export type GroupBy<Item extends Record<string, unknown>, key extends keyof Item> = {
  [P in keyof Item]: P extends key ? Item[P] : Item[P][];
};

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export type OkType<R extends Result<unknown>> = Extract<R, { ok: true }>['value'];

export type ReturnTupleType<F extends AnyFunction> = ReturnType<F>[number];

export type AwaitedStruct<O extends Record<string, unknown>> = {
  [P in keyof O]: Awaited<O[P]>;
};

export type DeepReadonly<T> = keyof T extends never
  ? T
  : { readonly [k in keyof T]: DeepReadonly<T[k]> };

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type DeepMutable<T> = keyof T extends never
  ? T
  : { -readonly [k in keyof T]: DeepMutable<T[k]> };

export type Unionize<T extends Record<string, unknown>> = {
  [K in keyof T]: { key: K; value: T[K] };
}[keyof T];

export type Objectify<U extends { key: string; value: unknown }> = {
  [T in U as T['key']]: T['value'];
};

declare const __brand: unique symbol;

export type Branded<T, B> = T & { readonly [__brand]: B };

export type Undef<T> = T | undefined;

export type SimpleErrorOrValue<S, F = Error> =
  | {
      value: S;
      error?: undefined;
    }
  | {
      error: F;
      value?: undefined;
    };
