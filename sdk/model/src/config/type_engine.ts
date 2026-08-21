import type { Cfg } from "./model";

/** Config tree of an already published block, as stored in its compiled model.
 *
 * Nothing in the SDK builds these any more — the builder DSL that produced them
 * went away with the v1/v2 block model. The type is kept because the middle
 * layer still has to read and render configs of blocks published before that. */
export type TypedConfig = Cfg;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const plResourceEntry: unique symbol;

/** Marks that a certain variable in context is a resource entry */
export type PlResourceEntry = typeof plResourceEntry;

export type OptionalPlResourceEntry = PlResourceEntry | undefined;
