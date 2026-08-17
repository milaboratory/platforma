import { BlockPointer as enterNumbersSpec } from "@milaboratories/milaboratories.test-enter-numbers";
import { BlockPointer as sumNumbersSpec } from "@milaboratories/milaboratories.test-sum-numbers";
import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import { createPlRef, resolveTemplateRefs } from "@milaboratories/pl-model-common";
import type { BlockPackProvider, Project } from "@milaboratories/pl-middle-layer";
import {
  parseProjectTemplateV1Yaml,
  templateBlockPackProvider,
} from "@milaboratories/pl-middle-layer";
import { deriveDataFromStorage } from "@platforma-sdk/model";
import { test } from "vitest";
import { awaitBlockDone, awaitBlockStateStable } from "./test-helpers";
import { withMl } from "./with-ml";

/**
 * Export and apply are inverses: what a project writes out, applying it reads back
 * into an equivalent project.
 *
 * The two halves that only a live project can exercise are `exportProjectAsTemplate`
 * — which derives every block's params in the model VM off stored block state — and
 * `applyTemplateToProject`, which resolves, installs and places the blocks against a
 * real backend. Everything between them (the walk, the serializer, resolution, the
 * orchestrator, id assignment) is unit-tested in the middle layer; what is proven
 * here is that the two ends compose.
 *
 * Transport is held constant and local. Both test blocks are installed from a built
 * pack on disk, so their entries carry a `location` and no registry is consulted —
 * which is why `registryIds` below is empty. Where a block's bytes come from is a
 * resolution concern behind `BlockPackProvider` and is covered separately; it is not
 * part of the claim that export and apply are inverses.
 */

/** How much slack a block gets to compute, cold, on a freshly created project. */
const RUN_TIMEOUT_MS = 60_000;

/**
 * How long a block's state may take to settle.
 *
 * Well above the helper's own default, which is short enough to abort on a cold render
 * of a block that was just created — a flake, not a finding.
 */
const STATE_TIMEOUT_MS = 60_000;

/** A block's settled state, with a budget that survives a cold machine. */
async function settled(project: Project, blockId: string) {
  return await awaitBlockStateStable(project, blockId, STATE_TIMEOUT_MS);
}

test("v3: a project exported as a template applies back as an equivalent project", async ({
  expect,
}) => {
  await withMl(async (ml) => {
    // --- A configured, running source project ------------------------------

    const sourceId = await ml.createProject({ label: "Source" });
    await ml.openProject(sourceId);
    const source = ml.getOpenedProject(sourceId);

    const numbersId = await source.addBlock("Numbers", enterNumbersSpec);
    const sumId = await source.addBlock("Sum", sumNumbersSpec);

    // `numbers` is what this block's kind declares; `description` is not, and is set
    // here to something distinguishable so the trip's boundary is visible below.
    await source.mutateBlockStorage(numbersId, {
      operation: "update-block-data",
      value: { numbers: [1, 2, 3], labels: [], description: "outside the params contract" },
    });
    await source.mutateBlockStorage(sumId, {
      operation: "update-block-data",
      value: { sources: [createPlRef(numbersId, "numbers")] },
    });

    await source.runBlock(sumId);
    await awaitBlockDone(source, sumId, RUN_TIMEOUT_MS);

    const sourceNumbersData = blockData(await settled(source, numbersId));
    const sourceSumState = await settled(source, sumId);
    const sourceSumData = blockData(sourceSumState);
    expect(sourceSumState.outputs!["sum"]).toMatchObject({ ok: true, value: 6 });

    // --- Export ------------------------------------------------------------

    const exported = await ml.exportProjectAsTemplate(sourceId);
    if (!exported.ok) throw new Error(`export failed: ${JSON.stringify(exported.problems)}`);

    // Entry ids are the source project's own block ids, in structure order.
    expect(exported.document.blocks.map((entry) => entry.id)).toStrictEqual([numbersId, sumId]);

    // The wiring is in the file, as a reference naming the upstream entry. Asserted
    // before the comparisons below, which would otherwise be satisfied by two documents
    // that both carry nothing.
    expect(exported.document.blocks[0].params).toStrictEqual({ numbers: [1, 2, 3] });
    expect(exported.document.blocks[1].params).toStrictEqual({
      // The reference is stored as the block itself holds it, inside the one wrapper the
      // document recognizes — and the wrapper is around the reference, not around the array
      // holding it, so each identifier is marked where it sits.
      sources: [{ $ref: createPlRef(numbersId, "numbers") }],
    });

    // Both blocks came from a folder on this machine, and each entry says so by
    // carrying the locator that folder resolves to — which is what makes the apply
    // below reachable without a registry.
    for (const entry of exported.document.blocks) {
      expect(entry.location).toMatch(/^file:\/\//);
    }

    // --- Apply, from the text and not the document -------------------------

    // The document is already asserted to parse on every export; going through the
    // YAML is what proves the text a user would save is what the importer reads.
    const parsed = parseProjectTemplateV1Yaml(exported.yaml);
    if (!parsed.ok) throw new Error(`the exported YAML did not parse: ${parsed.error}`);

    const targetId = await ml.createProject({ label: "Target" });
    const report = await ml.applyTemplateToProject(targetId, parsed.document, localPacksOnly());

    expect(report.problems).toStrictEqual([]);
    expect(report.added.map((entry) => entry.templateLocalId)).toStrictEqual([numbersId, sumId]);

    const appliedId = new Map(report.added.map((entry) => [entry.templateLocalId, entry.blockId]));
    // Applied blocks are new blocks with new ids, which is why equivalence below is
    // stated up to renaming rather than as equality of ids.
    expect(appliedId.get(numbersId)).not.toBe(numbersId);

    // --- 1. The applied project exports to the same template ---------------

    const reExported = await ml.exportProjectAsTemplate(targetId);
    if (!reExported.ok) throw new Error(`re-export failed: ${JSON.stringify(reExported.problems)}`);

    expect(canonical(reExported.document)).toStrictEqual(canonical(exported.document));

    // --- 2. Every block starts with the state its source block held --------

    await ml.openProject(targetId);
    const target = ml.getOpenedProject(targetId);

    // Bounded by the params contract, and only by it. `numbers` is declared by the kind
    // and arrives intact; `description` is not, so the applied block holds what its own
    // init produces instead of what the source block held. A block's fidelity is
    // therefore its own choice of what to project into params — silent for anything left
    // out, which is why this asserts the loss rather than looking away from it.
    expect(sourceNumbersData).toMatchObject({ description: "outside the params contract" });
    expect(blockData(await settled(target, appliedId.get(numbersId)!))).toStrictEqual({
      numbers: [1, 2, 3],
      labels: [],
      description: "",
    });

    // The one field that must differ: the reference now names the block the apply
    // created, not the one it was exported from.
    expect(blockData(await settled(target, appliedId.get(sumId)!))).toStrictEqual(
      renameInLiveParams(sourceSumData, appliedId),
    );

    // --- 3. And the applied project computes what the source computed ------

    const appliedSumId = appliedId.get(sumId)!;
    await target.runBlock(appliedSumId);
    await awaitBlockDone(target, appliedSumId, RUN_TIMEOUT_MS);
    expect((await settled(target, appliedSumId)).outputs!["sum"]).toMatchObject({
      ok: true,
      value: 6,
    });
  });
});

/**
 * A reference naming a block the project no longer has is written out as-is.
 *
 * The boundary rather than a wish: the engine stores a reference payload verbatim and never
 * opens one, so it cannot know that an id inside a payload names nothing. Reporting this would
 * take exactly the reference knowledge that was deliberately removed — knowing which values
 * carry block ids is the block's statement to make, not the document's.
 *
 * Nothing is lost by allowing it, which is why the state is reachable at all: a live project
 * holds these routinely, because deleting a block does not rewrite what pointed at it. The
 * exported file is as broken as the project it was exported from, and in the same way.
 *
 * What a subsequent apply makes of such a file is not asserted here. Only the redirect is
 * certain: an id with no entry to redirect to is left as it is.
 */
test("v3: a reference to a deleted block survives the export unexamined", async ({ expect }) => {
  await withMl(async (ml) => {
    const projectId = await ml.createProject({ label: "With a dangling reference" });
    await ml.openProject(projectId);
    const project = ml.getOpenedProject(projectId);

    const numbersId = await project.addBlock("Numbers", enterNumbersSpec);
    const sumId = await project.addBlock("Sum", sumNumbersSpec);
    await project.mutateBlockStorage(sumId, {
      operation: "update-block-data",
      value: { sources: [createPlRef(numbersId, "numbers")] },
    });
    await settled(project, sumId);

    await project.deleteBlock(numbersId);
    await settled(project, sumId);

    const exported = await ml.exportProjectAsTemplate(projectId);
    if (!exported.ok) throw new Error(`export failed: ${JSON.stringify(exported.problems)}`);

    // One entry, because the block the reference names is gone from the structure — while the
    // reference to it is still in the surviving block's params, naming an entry the document
    // does not define.
    expect(exported.document.blocks.map((entry) => entry.id)).toStrictEqual([sumId]);
    expect(exported.document.blocks[0].params).toStrictEqual({
      sources: [{ $ref: createPlRef(numbersId, "numbers") }],
    });
  });
});

/** A block's current data, as the model sees it. */
function blockData(state: Awaited<ReturnType<typeof awaitBlockStateStable>>): unknown {
  return deriveDataFromStorage(state.blockStorage);
}

/**
 * A provider for a document whose every entry names a place on this machine.
 *
 * Configuring no registries is not a shortcut: a located entry is resolved by reading
 * the folder it names, and consulting a registry for one would be a bug. With the list
 * empty there is nothing for the kind route to read, so an entry that reached it would
 * fail the apply rather than pass quietly.
 */
function localPacksOnly(): BlockPackProvider {
  return templateBlockPackProvider({
    registry: {
      resolveKind: () => {
        throw new Error("a located entry must not consult a registry");
      },
      getOverview: () => {
        throw new Error("a located entry must not consult a registry");
      },
    },
    registryIds: [],
    logger: {
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg),
    },
  });
}

/**
 * A document with every entry id replaced by its position, references included.
 *
 * Two exports of the same pipeline can never be textually equal: the entry ids are the
 * project's block ids, and applying a template creates new blocks with new ids. What
 * "equivalent" has to mean is therefore equality up to that renaming — same blocks, in
 * the same order, with the same kinds, the same locators and the same params, wired the
 * same way. Position is the right name to canonicalize to because the list's order is
 * itself part of the document's meaning: it is the instantiation order.
 *
 * Not covered, deliberately: a block's label, which is an instance name a template does
 * not carry, and any block state outside what the block projects into params. Both are
 * lost by design, and the assertions above pin each one where it is visible rather than
 * hiding them in here.
 */
function canonical(document: ProjectTemplateV1): ProjectTemplateV1 {
  const positionOf = new Map(document.blocks.map((entry, i) => [entry.id, `b${i}`]));

  // Renaming goes through the engine's own redirect, so this recognizes exactly the
  // references the engine recognizes — reimplementing the walk here would let the comparison
  // agree with a bug instead of catching it. Note it rewrites INSIDE the wrappers and leaves
  // them in place, which is what a document holds.
  const blocks = document.blocks.map((entry, i) => ({
    ...entry,
    id: `b${i}`,
    ...(entry.params !== undefined ? { params: renameInsideRefs(entry.params, positionOf) } : {}),
  }));

  return { ...document, blocks };
}

/** Redirect the block ids inside every reference wrapper, keeping the wrappers. */
function renameInsideRefs(
  params: Record<string, unknown>,
  newIdOf: ReadonlyMap<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, renameInLiveParams(value, newIdOf)]),
  );
}

/**
 * Rename the blocks named by references inside a value — live params, or one reference
 * payload.
 *
 * Wrapping the value and resolving it back is the engine's own redirect, applied to
 * something that is not a document. Re-implementing the walk here would let the comparison
 * agree with a bug instead of catching it.
 */
function renameInLiveParams(value: unknown, newIdOf: ReadonlyMap<string, string>): unknown {
  const wrapped = resolveTemplateRefs({ $ref: value }, newIdOf);
  return wrapped;
}
