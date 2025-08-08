/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helper to filter keys of a type by a prefix.
 */
export type FilterKeysByPrefix<T, P extends string> = keyof {
  [K in keyof T as K extends `${P}${string}` ? K : never]: T[K];
};

/**
 * Helper to assert that two types are equal. This will cause a compile-time error if they are not.
 * We use this to ensure all feature flags are accounted for in the arrays below.
 */
export type AssertKeysEqual<T, U> = (<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
  ? unknown
  : { error: 'Feature flag definitions are out of sync'; expected: T; actual: U };

/**
 * Checks if two types are exactly equal.
 * Returns 'true' if they are, 'false' otherwise.
 */
export type Is<T, U> = (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
  ? true
  : false;

/**
 * Checks if T is a subtype of U.
 * Returns 'true' if it is, 'false' otherwise.
 */
export type IsSubtypeOf<T, U> = T extends U ? true : false;

/**
 * Asserts that a condition is true at compile time.
 * Causes a compile error if T is not 'true'.
 */
export type Assert<T extends true> = T;

/**
 * Helper to create a union type of two array value types.
 */
export type ArrayTypeUnion<T extends readonly any[], U extends readonly any[]> = T[number] extends never
  ? U[number]
  : U[number] extends never
    ? T[number]
    : T[number] | U[number];
