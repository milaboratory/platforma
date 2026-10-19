import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { notEmpty } from "@milaboratories/ts-helpers";
import {
  columnProducer,
  type ColumnReference,
  type OutputDependency,
} from "@milaboratories/pl-model-common";
import type { ProjectHelper } from "./project_helper";
import {
  type ProjectField,
  type ProjectStructure,
  ProjectStructureKey,
  projectFieldName,
} from "./project_model";
import { allBlocks } from "./project_model_util";

/** Dependencies on the outputs of every producer block, keyed by producer block id. */
export type OutputDependencyIndex = Map<string, OutputDependency[]>;

/** A project field a block's args are read from: the current ones, or those of the last run. */
export type ArgsField = Extract<ProjectField["fieldName"], "currentArgs" | "prodArgs">;

/**
 * Which block's args reference which output of which other block, across all blocks of the
 * project.
 *
 * A block's references are read from its current args, else from the args of its last run; a
 * block with neither is skipped. The producer of a referenced column is the block that exports
 * its leaf. A reference is indexed only when the producer is above the dependent block in the
 * project: a column local to the dependent block has no producer, and a producer that is not
 * above cannot be run against — the dependent block already reports such a reference as missing.
 * Dependencies come in project order of the dependent blocks; within one block, in the order its
 * args hold them.
 *
 * @param argsOf args of a block from the given field, `undefined` if the block has no such field.
 *   Asked for the last run's only when the block has no current args.
 * @param referencesOf the columns `args` references.
 */
export function buildOutputDependencyIndex<A>(
  structure: ProjectStructure,
  ops: {
    argsOf: (blockId: string, field: ArgsField) => A | undefined;
    referencesOf: (args: A) => readonly ColumnReference[];
  },
): OutputDependencyIndex {
  const index: OutputDependencyIndex = new Map();
  // Blocks above the current one in the project: the only producers a block can run against.
  const above = new Set<string>();
  for (const { id: dependentBlockId } of allBlocks(structure)) {
    const args =
      ops.argsOf(dependentBlockId, "currentArgs") ?? ops.argsOf(dependentBlockId, "prodArgs");
    const references = args === undefined ? [] : ops.referencesOf(args);
    for (const { ref, values } of references) {
      const producer = columnProducer(ref);
      if (producer === undefined || !above.has(producer.blockId)) continue;
      addDependency(index, producer.blockId, {
        dependentBlockId,
        output: producer.name,
        ref,
        values,
      });
    }
    above.add(dependentBlockId);
  }
  return index;
}

/**
 * {@link buildOutputDependencyIndex} over the live project. Reading every block's args through
 * `prj` makes a computable that calls it recalculate whenever any block's args change or blocks
 * are added, removed or moved.
 */
export function readOutputDependencyIndex(
  prj: PlTreeNodeAccessor,
  projectHelper: ProjectHelper,
): OutputDependencyIndex {
  const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
  return buildOutputDependencyIndex(structure, {
    argsOf: (blockId, field) =>
      prj.traverse({
        field: projectFieldName(blockId, field),
        assertFieldType: "Dynamic",
        stableIfNotFound: true,
      }),
    referencesOf: (args) => projectHelper.getColumnReferences(args.id, () => args.getDataAsJson()),
  });
}

// Internals

function addDependency(
  index: OutputDependencyIndex,
  producerBlockId: string,
  dependency: OutputDependency,
): void {
  const dependencies = index.get(producerBlockId);
  if (dependencies === undefined) index.set(producerBlockId, [dependency]);
  else dependencies.push(dependency);
}
