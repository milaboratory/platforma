export type AnyFunction = (...args: any[]) => any;

export type Optional<T> = T | undefined;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type MethodOf<T> = {
  [K in keyof T]: T[K] extends AnyFunction ? K : never;
}[keyof T];

export type CallEvent<T extends Record<string, AnyFunction>> = {
  [P in keyof T]: {
    type: P;
    params: Parameters<T[P]>
  };
}[keyof T];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Shift<A extends ReadonlyArray<unknown>> = A extends [infer V, ...(infer L)] ? L : never;

export type AsyncReturnType<T extends AnyFunction> = Promise<Awaited<ReturnType<T>>>;

export type AsyncReturnTypeOptional<T extends AnyFunction> = Promise<Awaited<ReturnType<T>> | void>;

export type NonEmpty<T> = T extends null | undefined ? never : T;

export type Values<T> = T[keyof T];

export type ReturnValues<O extends Record<string, AnyFunction>> = Values<{
  [P in keyof O]: ReturnType<O[P]>
}>;

export type Option<T = unknown> = {
  text: string;
  value: T;
};

export type GroupBy<Item extends Record<string, unknown>, key extends keyof Item> = {
  [P in keyof Item]: P extends key ? Item[P] : Item[P][]
};

export type OptionType<Type> = Type extends Option<infer X>[] ? X : never;

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };