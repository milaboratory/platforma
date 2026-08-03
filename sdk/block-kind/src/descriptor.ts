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
  /**
   * Runtime check of params that did not come from a typed caller — in practice,
   * params read out of a template file someone wrote by hand.
   *
   * Optional, and everything works without it: a kind that declares no parser gets
   * params passed through as they were written, which is the only behaviour that
   * existed before this slot. What it buys is the difference between a bad value
   * being caught at the entry that carries it and being caught much later, or never
   * — params typed `number[]` arriving as `["3","1","2"]` reach the block's init and
   * the workflow with no error anywhere, and a numeric sort silently becomes a
   * lexicographic one.
   *
   * Must THROW to reject, and must RETURN the params to use. Returning rather than
   * validating in place is what lets a parser strip keys the kind does not declare
   * and coerce what it chooses to coerce — its output is what the block receives.
   *
   * The signature is a plain function so this package stays dependency-free and a
   * kind author picks their own tool. With zod:
   *
   * ```ts
   * const Params = z.object({ numbers: z.array(z.number()).optional() }).strict();
   * export const kind = defineBlockKind<BlockParams>({
   *   name, version, parseTemplateParams: (v) => Params.parse(v),
   * });
   * ```
   *
   * TypeScript checks the parser against the declared type, since it must return
   * `BlockParams` — so a schema that forgets a required field does not compile. The
   * reverse (a schema that accepts less than the type allows) is not caught, which is
   * the honest limit of this slot.
   *
   * Params reach it with references already in live `PlRef` form; on the pre-flight
   * check that happens before any block exists, the reference ids are placeholders,
   * so a parser must not treat a specific id as meaningful.
   */
  readonly parseTemplateParams?: (value: unknown) => BlockParams;
  readonly __PHANTOM_BLOCK_PARAMS__?: (p: BlockParams) => void;
}

/** Current compiled-kind envelope. A discriminated union once later schemas land. */
export type CompiledBlockKind<BlockParams> = CompiledBlockKindV1<BlockParams>;

/**
 * Recover the declared `BlockParams` off a compiled kind object. The contract
 * the deferred `DataModelBuilder` / `BlockModelV3.create` wiring relies on.
 */
export type InferBlockParams<K> = K extends CompiledBlockKind<infer P> ? P : never;
