declare const __brand: unique symbol;

export type Branded<T, B> = T & { readonly [__brand]: B };

// simple regex string, without flags or lookarounds
export type RegExpString = Branded<string, "regexp">;

// JSON string, must be parseable by JSON.parse
export type JsonString = Branded<string, "json">;

// ISO 8601 date string, must be parseable by new Date()
export type IsoString = Branded<string, "iso">;
