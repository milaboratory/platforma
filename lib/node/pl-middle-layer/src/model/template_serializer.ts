import YAML from "yaml";
import { pathToFileURL } from "node:url";
import type {
  BlockKindReference,
  BlockKindSelectorReference,
  BlockPackLocationReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  PROJECT_TEMPLATE_SCHEMA_V1,
  findProjectTemplateV1ReferenceProblems,
  kindReferenceToSelectorReference,
  parseProjectTemplateV1,
} from "@milaboratories/pl-model-common";
import type { BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type { ProjectStructure } from "./project_model";
import type {
  TemplateExportProblem,
  TemplateExportWalk,
  TemplateParamsResult,
} from "./template_export";
import { walkProjectForTemplateExport } from "./template_export";

/** A block's exact kind reference, or `undefined` for a block that declares no kind. */
export type BlockKindProvider = (blockId: string) => BlockKindReference | undefined;

/**
 * A block's origin spec — where the installed block came from — or `undefined` when
 * it is not known for that block.
 *
 * The project stores this next to the kind reference, so both are read from the same
 * place and neither costs an extra round-trip.
 */
export type BlockPackSpecProvider = (blockId: string) => BlockPackSpec | undefined;

/** What the caller gets back for a whole project. */
export type ProjectTemplateExportOutcome =
  | {
      readonly ok: true;
      readonly yaml: string;
      /** The document the YAML was rendered from, already validated. */
      readonly document: ProjectTemplateV1;
    }
  | {
      readonly ok: false;
      /** Every block that stands in the way, not just the first. */
      readonly problems: readonly TemplateExportProblem[];
    };

/**
 * The `location` to write for a block installed from the filesystem, or `undefined`
 * for one that came from a registry and therefore needs no locator.
 *
 * Both filesystem spec shapes are emitted, and they anchor at different directories
 * — a dev block at its facade package, an npm-consumed one at its block-pack folder.
 * The document does not distinguish them: one URI is written either way, and telling
 * the two layouts apart is done by looking at what is actually there, by the side
 * that has the filesystem anyway. Encoding the layout in the file instead would
 * freeze today's two shapes into the format.
 *
 * A dev spec carries an OS path and is converted here, which also percent-encodes a
 * path containing spaces. An npm-consumed spec already carries a `file:` URL and is
 * passed through: it is the locator the block itself emitted, and reconstructing one
 * from it could only lose information.
 */
export function locationOf(spec: BlockPackSpec): BlockPackLocationReference | undefined {
  switch (spec.type) {
    case "dev-v2":
      return pathToFileURL(spec.folder).href as BlockPackLocationReference;
    case "from-pack-v2":
      return spec.packUrl as BlockPackLocationReference;
    // A registry block is found by name, which is what makes the entry portable —
    // writing where this machine happened to cache it would take that away. `dev-v1`
    // predates kinds entirely, so such a block has no kind and never reaches here.
    case "dev-v1":
    case "from-registry-v1":
    case "from-registry-v2":
      return undefined;
  }
}

/**
 * Turn a project into a template document.
 *
 * Assembly is deliberately dull — the entry is the block's id, its widened kind
 * reference, and the params the walk already collected. The interesting decisions
 * were made upstream; what is left here is the two things only this layer can
 * check, both of which produce problems rather than a broken file:
 *
 * - **A block with no kind cannot be written.** An entry's `kind` is required — it
 *   is the params contract the entry is typed against — while a block's kind is
 *   optional, so a block that predates kinds, or that uses the deprecated
 *   kind-less model overload, has no legal entry. Reported per block. This is not
 *   an edge case today: it is what most existing projects will hit until their
 *   blocks are republished.
 * - **References must point at an entry declared earlier.** Verbatim id reuse
 *   means a reference to a deleted block survives into the file naming nothing:
 *   deleting a block only removes it from the structure and does not rewrite
 *   downstream args, so a live project holds such references routinely.
 *
 * `block` is never emitted. That override exists to pin an implementation against
 * a kind's version range, and export always writes the exact version the block
 * implements, so there is nothing left for it to pin.
 *
 * `location` IS emitted, for every block that was installed from the filesystem. Such
 * a block is not in any registry, so the kind reference alone names nothing the
 * importer could find, and a file that omitted the one usable answer would describe a
 * project that cannot be recreated. It costs portability, and nothing says so: such a
 * file is the debugging path, read by the developer who wrote it on the machine that
 * wrote it.
 *
 * Problems from `walk` are carried through, so a caller can hand a walk straight
 * in and get one combined list.
 */
export function assembleProjectTemplateV1(
  walk: TemplateExportWalk,
  kindProvider: BlockKindProvider,
  specProvider: BlockPackSpecProvider,
): { document: ProjectTemplateV1; problems: readonly TemplateExportProblem[] } {
  const problems: TemplateExportProblem[] = [...walk.problems];
  const blocks: ProjectTemplateV1Entry[] = [];

  for (const entry of walk.entries) {
    const kind = kindProvider(entry.blockId);

    if (kind === undefined) {
      problems.push({
        blockId: entry.blockId,
        error:
          "Block declares no kind, so it cannot be written to a template: an entry's kind " +
          "carries the params contract the entry is typed against",
      });
      continue;
    }

    let selector: BlockKindSelectorReference;
    try {
      // Widening validates, and therefore throws — which is why it happens here
      // and not where the reference is read: every read site sits inside a
      // recomputed project overview, where one malformed stored reference must not
      // be able to break unrelated blocks.
      selector = kindReferenceToSelectorReference(kind);
    } catch (e) {
      problems.push({
        blockId: entry.blockId,
        error: `Block's stored kind reference is malformed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    const spec = specProvider(entry.blockId);
    const location = spec === undefined ? undefined : locationOf(spec);

    blocks.push({
      id: entry.blockId,
      kind: selector,
      ...(location !== undefined ? { location } : {}),
      // Always written, including as `{}`. Every block projects its params — the model
      // does not build otherwise — so there is no export that legitimately has none, and
      // an omitted key would only read back as the same `{}` anyway.
      params: entry.params,
    });
  }

  const document: ProjectTemplateV1 = { schema: PROJECT_TEMPLATE_SCHEMA_V1, blocks };

  for (const problem of findProjectTemplateV1ReferenceProblems(document)) {
    problems.push({ blockId: problem.entryId, error: problem.message });
  }

  return { document, problems };
}

/**
 * Render a template document to YAML text.
 *
 * Two non-default emitter settings, both about the file being read by someone
 * else's code:
 *
 * - **No line folding.** A wrapped scalar still parses, but it makes a diff between
 *   two exported templates unreadable, which is most of the reason to prefer YAML
 *   over JSON here.
 * - **Quote as if the reader were YAML 1.1**, while still parsing as 1.2. YAML 1.2
 *   dropped `yes`/`no`/`on`/`off`/`y`/`n` as booleans and dropped sexagesimal
 *   integers, so a 1.2 emitter leaves a params value of `"yes"` or `"1:30"` bare —
 *   which a 1.1 reader (PyYAML's default, and Go's yaml.v2) turns into `true` and
 *   `90`. A template is a contract for a second implementation, so the safe
 *   combination is to quote against the stricter ruleset and read with the looser
 *   one: a quoted scalar means the same thing under both. This adds no `%YAML`
 *   directive — it only changes which scalars get quotes.
 */
export function stringifyProjectTemplateV1(document: ProjectTemplateV1): string {
  return YAML.stringify(document, { lineWidth: 0, version: "1.1" });
}

/**
 * Export a project as `template-v1` YAML, or report every reason it cannot be.
 *
 * All-or-nothing on purpose. A partial template silently drops blocks and the
 * surviving entries may reference the dropped ones, so what looks like a
 * successful export would produce a project missing pieces the user never chose
 * to leave out. Reporting everything at once instead of failing on the first
 * problem is the other half of that: fixing an export should take one pass.
 *
 * @param structure The project structure, which supplies both membership and order
 * @param paramsProvider A block's derived template params, in template form
 * @param kindProvider A block's exact kind reference, read from its stored config
 * @param specProvider A block's origin spec, read from the same stored container
 */
export function exportProjectAsTemplateV1(
  structure: ProjectStructure,
  paramsProvider: (blockId: string) => TemplateParamsResult | undefined,
  kindProvider: BlockKindProvider,
  specProvider: BlockPackSpecProvider,
): ProjectTemplateExportOutcome {
  const walk = walkProjectForTemplateExport(structure, paramsProvider);
  const { document, problems } = assembleProjectTemplateV1(walk, kindProvider, specProvider);

  if (problems.length > 0) return { ok: false, problems };

  // Export must emit exactly what import parses, so that is asserted on every
  // export rather than only in tests — running the import-side parser over the
  // document we are about to write is the cheapest possible proof of it. Nothing
  // user-facing is expected to fail here: the kind grammar was checked by the
  // widening above, params were checked to be a mapping by the walk, and the
  // reference rules by the assembler. A throw means a bug in the assembler, with
  // one known exception: a project structure holding two blocks with the same id,
  // which is reachable through the mutator and produces duplicate entry ids.
  parseProjectTemplateV1(document);

  return {
    ok: true,
    yaml: stringifyProjectTemplateV1(document),
    document,
  };
}
