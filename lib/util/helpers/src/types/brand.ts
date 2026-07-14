/**
 * Phantom-property brand. The key is a plain string literal rather than a
 * `unique symbol` so the resulting type stays fully nameable across packages.
 *
 * A `unique symbol` key forces TS, when forced to expand `Branded<T, B>` into
 * its structural form (e.g. inside `Record<BrandedUnion, V>` index signatures
 * during dts emit), to write out `typeof __brand` — a value-level reference
 * to the symbol. If the symbol's declaring module isn't reachable from the
 * compilation root, dts emit fails with TS4023 ("cannot be named"). Using a
 * string key sidesteps this entirely: `{ __brand: B }` is a plain structural
 * type, nameable from anywhere.
 *
 * Phantom keys provide compile-time discrimination only — two different brand
 * tags `B1 ≠ B2` make `Branded<T, B1>` and `Branded<T, B2>` mutually
 * incompatible regardless of whether the key is a symbol or a string.
 */
export type Branded<T, B> = T & { readonly __brand: B };

// simple regex string, without flags or lookarounds
export type RegExpString = Branded<string, "regexp">;

// JSON string, must be parseable by JSON.parse
export type JsonString = Branded<string, "json">;

// ISO 8601 date string, must be parseable by new Date()
export type IsoString = Branded<string, "iso">;
