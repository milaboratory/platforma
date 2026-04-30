import { z } from "zod";
import type { AxisQualification } from "./drivers/pframe/spec/selectors";
import type { PObjectId } from "./pool/spec";

export const PlRef = z
  .object({
    __isRef: z
      .literal(true)
      .describe("Crucial marker for the block dependency tree reconstruction"),
    blockId: z.string().describe("Upstream block id"),
    name: z.string().describe("Name of the output provided to the upstream block's output context"),
    requireEnrichments: z
      .literal(true)
      .optional()
      .describe(
        "True if current block that stores this reference in its args, may need enrichments " +
          "for the references value originating from the blocks in between current and referenced block",
      ),
  })
  .describe(
    "Universal reference type, allowing to set block connections. It is crucial that " +
      "{@link __isRef} is present and equal to true, internal logic relies on this marker " +
      "to build block dependency trees.",
  )
  .readonly();
export type PlRef = z.infer<typeof PlRef>;
/** @deprecated use {@link PlRef} */
export type Ref = PlRef;

/**
 * Type guard to check if a value is a PlRef.
 *
 * @param value - The value to check.
 * @returns True if the value is a PlRef, false otherwise.
 */
export function isPlRef(value: unknown): value is PlRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "__isRef" in value &&
    (value as { __isRef: unknown }).__isRef === true &&
    "blockId" in value &&
    "name" in value
  );
}

/** Standard way how to communicate possible connections given specific
 * requirements for incoming data. */
export type Option = {
  /** Fully rendered reference to be assigned for the intended field in block's
   * args */
  readonly ref: PlRef;

  /** Label to be present for the user in i.e. drop-down list */
  readonly label: string;
};

/**
 * Creates a PlRef with the given blockId and name.
 *
 * @param blockId - The blockId of the reference.
 * @param name - The name of the reference.
 * @param requireEnrichments - Whether the reference requires enrichments.
 */
export function createPlRef(
  blockId: string,
  name: string,
  requireEnrichments: boolean = false,
): PlRef {
  if (requireEnrichments)
    return {
      __isRef: true,
      blockId,
      name,
      requireEnrichments: true,
    };
  else
    return {
      __isRef: true,
      blockId,
      name,
    };
}

/**
 * Creates a new PlRef based on an existing one, explicitly setting (default) or removing the
 * requireEnrichments property.
 *
 * @param ref - The original PlRef object.
 * @param requireEnrichments - If true, the `requireEnrichments: true` property is added
 *   to the returned PlRef. If false, the `requireEnrichments` property is removed. Defaults to true.
 * @returns A new PlRef object with the `requireEnrichments` property set or removed accordingly.
 */
export function withEnrichments(ref: PlRef, requireEnrichments: boolean = true): PlRef {
  if (requireEnrichments)
    return {
      ...ref,
      requireEnrichments: true,
    };
  else {
    const { requireEnrichments: _, ...rest } = ref;
    return rest;
  }
}

/** Primary dataset reference with an optional filter. */
export type PrimaryRef = {
  readonly __isPrimaryRef: "v1";
  readonly column: PlRef;
  readonly filter?: PlRef;
};

export function isPrimaryRef(value: unknown): value is PrimaryRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __isPrimaryRef?: unknown }).__isPrimaryRef === "v1" &&
    "column" in value
  );
}

export function createPrimaryRef(column: PlRef, filter?: PlRef): PrimaryRef {
  if (filter !== undefined) return { __isPrimaryRef: "v1", column, filter };
  else return { __isPrimaryRef: "v1", column };
}

/** Block args accept either form — backward compatible. */
export type DatasetInput = PlRef | PrimaryRef;

/** Many-to-one linker hop. */
export type EnrichmentLinkerStep = {
  readonly type: "linker";
  readonly linker: PObjectId;
};

/** Step from primary to hit. `path[0]` applied first. */
export type EnrichmentStep = EnrichmentLinkerStep;

/**
 * Enrichment column reached via {@link path} linker hops; omitted means zero-hop.
 * `hit` and `path[].linker` are global-form {@link PObjectId}s
 * (`canonicalize({ __isRef: true, blockId, name })`) which the workflow decodes
 * to a PlRef before resolving. For a prerun-sourced hop, supply a resolved
 * `{spec, data}` map in place of the id — `tableBuilder` accepts both.
 */
export type EnrichmentRef = {
  readonly __isEnrichment: "v1";
  readonly hit: PObjectId;
  readonly path?: readonly EnrichmentStep[];
  readonly qualifications?: readonly AxisQualification[];
};

export function isEnrichmentRef(value: unknown): value is EnrichmentRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __isEnrichment?: unknown }).__isEnrichment === "v1" &&
    "hit" in value
  );
}

export type CreateEnrichmentRefOptions = {
  readonly path?: readonly EnrichmentStep[];
  readonly qualifications?: readonly AxisQualification[];
};

export function createEnrichmentRef(
  hit: PObjectId,
  options: CreateEnrichmentRefOptions = {},
): EnrichmentRef {
  const { path, qualifications } = options;
  return {
    __isEnrichment: "v1",
    hit,
    ...(path !== undefined && path.length > 0 ? { path } : {}),
    ...(qualifications !== undefined && qualifications.length > 0 ? { qualifications } : {}),
  };
}

/** {@link EnrichmentRef} plus the export header label. */
export type LabeledEnrichmentRef = {
  readonly ref: EnrichmentRef;
  readonly label: string;
};

/** Auto-attached enrichment payload; not user-picked. */
export type LabeledEnrichmentRefs = readonly LabeledEnrichmentRef[];

/** Compare two PlRefs and returns true if they are qual */
export function plRefsEqual(ref1: PlRef, ref2: PlRef, ignoreEnrichments: boolean = false) {
  return (
    ref1.blockId === ref2.blockId &&
    ref1.name === ref2.name &&
    (ignoreEnrichments || ref1.requireEnrichments === ref2.requireEnrichments)
  );
}
