// Phantom brand — declared as a type-level marker, never assigned at runtime.
declare const BLOCK_PARAMS: unique symbol;

/**
 * Compiled block-kind descriptor, schema version 1.
 *
 * The `kindSchema` discriminant lets future phases (template engine, sandbox)
 * introduce a `"v2"` arm; consumers narrow on `kindSchema`, so v1 descriptors
 * keep compiling untouched.
 *
 * `name` is the FULL npm package name of the kind, exactly as the template YAML
 * writes it (e.g. `@platforma-open/milaboratories.mixcr-clonotyping.kind`). The
 * S3 `{org, name}` path is always DERIVED from this npm name via the single
 * `npmNameToKindPath` helper — there is no separate `organization` field.
 *
 * `BlockParams` is carried as a TYPE ONLY, via a contravariant phantom slot
 * (a function-parameter position). Under `strictFunctionTypes` this blocks
 * silent structural widening between kinds of different param shapes: a kind
 * typed for `{ ref: PlRef; k: number }` is not assignable to one typed for
 * `{ ref: PlRef }`. The slot carries zero runtime bytes.
 */
export interface CompiledBlockKindV1<BlockParams> {
  readonly kindSchema: "v1";
  readonly name: string;
  readonly version: string;
  readonly [BLOCK_PARAMS]?: (p: BlockParams) => void;
}

/** Current compiled-kind envelope. A discriminated union once later schemas land. */
export type CompiledBlockKind<BlockParams> = CompiledBlockKindV1<BlockParams>;

/**
 * Recover the declared `BlockParams` off a compiled kind object. The contract
 * the deferred `DataModelBuilder` / `BlockModelV3.create` wiring relies on.
 */
export type InferBlockParams<K> = K extends CompiledBlockKind<infer P> ? P : never;
