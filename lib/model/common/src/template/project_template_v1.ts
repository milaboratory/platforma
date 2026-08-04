import { z } from "zod";
import type { Branded } from "@milaboratories/helpers";
import { splitVersionedName } from "../bmodel/block_kind_ref";
import type { BlockKindSelectorReference } from "./kind_selector";
import { parseKindSelector, parseKindSelectorReference } from "./kind_selector";

/**
 * Value of a template file's `schema` field — the format marker every
 * `template-v1` document opens with.
 */
export const PROJECT_TEMPLATE_SCHEMA_V1 = "template-v1";
export type ProjectTemplateSchemaV1 = typeof PROJECT_TEMPLATE_SCHEMA_V1;

/**
 * A template-local reference: entry `id` plus an upstream output name.
 *
 * A template cannot carry project-local UUIDs — the blocks do not exist until it
 * is applied — so an inter-block wire inside `params` is written as
 * `{ block: <entry id>, output: <output name> }`. On apply the engine rewrites
 * each of these into a concrete `PlRef` against the freshly assigned UUIDs
 * before the params reach the block's init lambda.
 */
export type TemplateLocalRef = {
  readonly block: string;
  readonly output: string;
};

/** Compose a {@link TemplateLocalRef}. */
export function createTemplateLocalRef(block: string, output: string): TemplateLocalRef {
  return { block, output };
}

/**
 * Whether `value` is a {@link TemplateLocalRef} — a plain object with exactly the
 * two string keys `block` and `output`.
 *
 * Deliberately exact: an object carrying a third key is NOT a reference, so a
 * kind that grows a `{ block, output, … }` param shape fails the reservation rule
 * loudly rather than having its params silently rewritten.
 */
export function isTemplateLocalRef(value: unknown): value is TemplateLocalRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2) return false;
  const v = value as Record<string, unknown>;
  return typeof v.block === "string" && typeof v.output === "string";
}

/**
 * On-wire reference to one exact block package version, `{name}@X.Y.Z`.
 *
 * The `block` override's value type. Exact only — the override exists to pin an
 * implementation, so a range would defeat it. Mapping this to the structured
 * `BlockPackId` (`{ organization, name, version }`) is import-side work; the
 * organization lives inside the npm scope here, as it does for kind names.
 */
export type BlockPackReference = Branded<string, "BlockPackReference">;

/**
 * Split a {@link BlockPackReference} into `{ name, version }`.
 *
 * @throws if the reference carries no version segment or the version is not
 *   exactly `X.Y.Z`
 */
export function parseBlockPackReference(ref: BlockPackReference): {
  name: string;
  version: string;
} {
  const { name, version } = splitVersionedName(ref, "block package reference", "{name}@X.Y.Z");
  const selector = parseKindSelector(version);
  if (selector.op !== "exact") {
    throw new Error(
      `A 'block' override must pin an exact version (expected '{name}@X.Y.Z'): ${ref}`,
    );
  }
  return { name, version: selector.version };
}

/**
 * On-wire locator naming WHERE one entry's block implementation comes from, as an
 * absolute URI: `file:///abs/path/to/block`.
 *
 * The third way an entry can reach an implementation, and the only one that names a
 * place rather than a name. It exists for a block that is built but not published —
 * the implementation lives in a folder and no registry knows it, so neither `kind`
 * resolution nor a `block` version pin can find it.
 *
 * A URI rather than a bare path because the question "where" is not limited to the
 * filesystem, and because scheme dispatch is how the rest of the toolchain already
 * answers it. Which schemes an environment can actually serve is that environment's
 * business: this type fixes only the grammar, so a document remains readable by a
 * consumer that cannot fetch every scheme.
 */
export type BlockPackLocationReference = Branded<string, "BlockPackLocationReference">;

/**
 * Read the scheme off a {@link BlockPackLocationReference}, which is all the
 * document layer knows about it — resolving the rest belongs to whoever can reach
 * the scheme.
 *
 * A scheme is required. Accepting a bare path would mean reading it relative to
 * whatever directory the application happens to have been started from, which is
 * exactly the ambiguity a locator exists to remove.
 *
 * @throws if the value carries no scheme
 */
export function parseBlockPackLocation(ref: BlockPackLocationReference): { scheme: string } {
  const match = LocationSchemePattern.exec(ref);
  if (!match) {
    throw new Error(
      `A 'location' must be an absolute URI with a scheme (expected e.g. ` +
        `'file:///path/to/block'), got: ${ref}`,
    );
  }
  return { scheme: match.groups!.scheme.toLowerCase() };
}

/**
 * Scheme grammar, with one deliberate narrowing: a scheme is at least TWO
 * characters, while the URI grammar allows one.
 *
 * `C:\blocks\my-block` is a valid single-letter-scheme URI, so a Windows path
 * pasted into the field would otherwise be accepted with scheme `c` and then fail
 * far away from the mistake. Rejecting it here means the error names the actual
 * problem, and the fix — `file:///C:/blocks/my-block` — is spelled out.
 */
const LocationSchemePattern = /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]+):/;

/**
 * One block in a template file.
 *
 * `kind` is always required: it carries the params contract the entry is typed
 * against, and it is checked against what the located implementation declares even
 * when it did not do the locating. `params` omitted means "start this block from its
 * kind's defaults". There is no `label` field: a template does not name block
 * instances for display.
 *
 * Two optional, mutually exclusive locator overrides answer different questions, and
 * either one skips kind resolution:
 *
 * - `block` — WHICH VERSION, leaving the environment to decide which registry serves
 *   it. Portable.
 * - `location` — WHICH PLACE. Names a concrete, possibly unpublished implementation,
 *   and is therefore only meaningful where that place exists.
 *
 * An entry carrying both states two different things with no way to reconcile them,
 * so it is rejected rather than resolved by precedence.
 */
export type ProjectTemplateV1Entry = {
  /**
   * Template-local identifier, unique within the file. Names the entry for
   * inter-block references; on export it is the block's project-local UUID,
   * reused verbatim.
   */
  readonly id: string;
  readonly kind: BlockKindSelectorReference;
  readonly block?: BlockPackReference;
  readonly location?: BlockPackLocationReference;
  /**
   * The block's `BlockParams` instance — opaque here, typed by the kind. Wires
   * to other entries appear inside it as {@link TemplateLocalRef}s.
   */
  readonly params?: Record<string, unknown>;
};

/**
 * A `template-v1` document — the primitive form of a template.
 *
 * `blocks` order is the instantiation order, so every entry must appear after
 * the entries it references. This type is the shared contract for both
 * directions of the round trip: export emits exactly this, import parses
 * exactly this.
 *
 * Scope note: this package owns the *document*, i.e. the shape of the value a
 * YAML (or JSON) reader hands back. The text layer stays out on purpose —
 * pl-model-common is in every block-model and UI bundle and takes no `yaml`
 * dependency; serializing to YAML bytes belongs with the caller that already
 * has one (pl-middle-layer).
 */
export type ProjectTemplateV1 = {
  readonly schema: ProjectTemplateSchemaV1;
  readonly blocks: readonly ProjectTemplateV1Entry[];
};

//
// Zod schemas — boundary validators only. The TS types above are the source of
// truth; each schema is pegged to its type via `satisfies`.
//
// The peg is `BoundaryParser<T>` rather than the repo-standard `z.ZodType<T>`
// because the branded string fields need a `.transform` to reach their branded
// output type, and a transforming schema's *input* is a plain `string`, which
// the two-parameter `z.ZodType<T>` (input defaults to output) rejects. Widening
// the input to `unknown` is also the more honest signature for a parser whose
// job is to accept whatever a file reader produced.
//
// `satisfies` only checks that the parser's output is assignable to the type —
// a parser NARROWER than the type still passes — so the exactness guard is the
// `expectTypeOf` assertion in the sibling test.
//

type BoundaryParser<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

const issue = (ctx: z.RefinementCtx, e: unknown) =>
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: e instanceof Error ? e.message : String(e),
  });

const kindSelectorReferenceSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      parseKindSelectorReference(value as BlockKindSelectorReference);
    } catch (e) {
      issue(ctx, e);
    }
  })
  .transform(
    (value) => value as BlockKindSelectorReference,
  ) satisfies BoundaryParser<BlockKindSelectorReference>;

const blockPackReferenceSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      parseBlockPackReference(value as BlockPackReference);
    } catch (e) {
      issue(ctx, e);
    }
  })
  .transform((value) => value as BlockPackReference) satisfies BoundaryParser<BlockPackReference>;

const blockPackLocationSchema = z
  .string()
  .superRefine((value, ctx) => {
    try {
      parseBlockPackLocation(value as BlockPackLocationReference);
    } catch (e) {
      issue(ctx, e);
    }
  })
  .transform(
    (value) => value as BlockPackLocationReference,
  ) satisfies BoundaryParser<BlockPackLocationReference>;

export const ProjectTemplateV1EntrySchema = z
  .object({
    id: z.string().min(1),
    kind: kindSelectorReferenceSchema,
    block: blockPackReferenceSchema.optional(),
    location: blockPackLocationSchema.optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.block !== undefined && entry.location !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message:
          `An entry cannot carry both 'block' and 'location': the first pins which version ` +
          `to install, the second pins where to install it from. Keep the one that is ` +
          `actually meant.`,
      });
    }
  })
  .readonly() satisfies BoundaryParser<ProjectTemplateV1Entry>;

export const ProjectTemplateV1Schema = z
  .object({
    schema: z.literal(PROJECT_TEMPLATE_SCHEMA_V1),
    blocks: z.array(ProjectTemplateV1EntrySchema).readonly(),
  })
  .strict()
  .readonly()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.blocks.forEach((entry, i) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", i, "id"],
          message: `Duplicate template-local id: ${entry.id}`,
        });
      }
      seen.add(entry.id);
    });
  }) satisfies BoundaryParser<ProjectTemplateV1>;

/**
 * Parse an already-decoded template document — the value a YAML or JSON reader
 * returns — into a {@link ProjectTemplateV1}.
 *
 * Checks the format marker, every entry's shape, the reference grammars, and id
 * uniqueness. It does NOT check that references point somewhere: that depends on
 * the reservation rule (see {@link TemplateLocalRef}), so it is kept out of the
 * parser and available separately as
 * {@link validateProjectTemplateV1References}.
 *
 * @throws {z.ZodError} on any of the above
 */
export function parseProjectTemplateV1(value: unknown): ProjectTemplateV1 {
  return ProjectTemplateV1Schema.parse(value);
}

/**
 * Collect every {@link TemplateLocalRef} inside an entry's `params`, walking
 * nested objects and arrays.
 *
 * Structural, kind-agnostic — it recognizes references by the reserved
 * `{ block, output }` shape (see {@link TemplateLocalRef}). It does not descend
 * into a value it recognized as a reference.
 */
export function collectTemplateLocalRefs(
  params: Record<string, unknown> | undefined,
): TemplateLocalRef[] {
  const found: TemplateLocalRef[] = [];
  const walk = (value: unknown) => {
    if (isTemplateLocalRef(value)) {
      found.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(walk);
    }
  };
  walk(params);
  return found;
}

/** Why one {@link TemplateLocalRef} is not usable, and which entry holds it. */
export type TemplateReferenceProblem = {
  /** The entry whose `params` hold the offending reference. */
  readonly entryId: string;
  readonly ref: TemplateLocalRef;
  /**
   * - `self` — the entry references its own output.
   * - `unknown` — the target id matches no entry in the document.
   * - `forward` — the target exists but is declared later, so it does not exist
   *   yet at the point this entry is created.
   */
  readonly reason: "self" | "unknown" | "forward";
  /** Human-readable form, suitable for showing to whoever triggered the export. */
  readonly message: string;
};

/**
 * Find every template-local reference that does not name an entry declared
 * EARLIER in `blocks`.
 *
 * Both halves of the ordering rule — every block must appear after the blocks it
 * references — in one pass, reporting an unknown target and a forward target
 * distinctly. Empty when the document is consistent.
 *
 * Structured rather than string-only so a caller that has to attribute a problem
 * to a block (an exporter reporting per-block failures, for instance) does not
 * have to parse the message back apart.
 *
 * Separate from {@link parseProjectTemplateV1} because it rests on the
 * reservation rule for `{ block, output }` — a parser must not depend on a rule
 * still awaiting sign-off.
 */
export function findProjectTemplateV1ReferenceProblems(
  doc: ProjectTemplateV1,
): TemplateReferenceProblem[] {
  const problems: TemplateReferenceProblem[] = [];
  const declaredBefore = new Set<string>();
  const allIds = new Set(doc.blocks.map((e) => e.id));

  for (const entry of doc.blocks) {
    for (const ref of collectTemplateLocalRefs(entry.params)) {
      if (ref.block === entry.id) {
        problems.push({
          entryId: entry.id,
          ref,
          reason: "self",
          message: `Entry '${entry.id}' references its own output '${ref.output}'`,
        });
      } else if (!allIds.has(ref.block)) {
        problems.push({
          entryId: entry.id,
          ref,
          reason: "unknown",
          message:
            `Entry '${entry.id}' references output '${ref.output}' of unknown entry ` +
            `'${ref.block}'`,
        });
      } else if (!declaredBefore.has(ref.block)) {
        problems.push({
          entryId: entry.id,
          ref,
          reason: "forward",
          message:
            `Entry '${entry.id}' references entry '${ref.block}', which is declared after it ` +
            `(blocks order is the instantiation order)`,
        });
      }
    }
    declaredBefore.add(entry.id);
  }

  return problems;
}

/**
 * {@link findProjectTemplateV1ReferenceProblems} as human-readable lines, for a
 * caller that only needs to show them.
 */
export function validateProjectTemplateV1References(doc: ProjectTemplateV1): string[] {
  return findProjectTemplateV1ReferenceProblems(doc).map((p) => p.message);
}
