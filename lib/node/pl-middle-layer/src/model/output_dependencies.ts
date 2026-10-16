import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { notEmpty } from "@milaboratories/ts-helpers";
import {
  columnProducer,
  mergeColumnReferences,
  type ColumnReference,
  type OutputDependency,
} from "@milaboratories/pl-model-common";
import type { ProjectHelper } from "./project_helper";
import { readArgsField, type ArgsField } from "./args_fields";
import { type ProjectStructure, ProjectStructureKey } from "./project_model";
import { allBlocks } from "./project_model_util";

/** Dependencies on the outputs of every producer block, keyed by producer block id. */
export type OutputDependencyIndex = Map<string, OutputDependency[]>;

export type { ArgsField };

/**
 * Which block's args reference which output of which other block, across all blocks of the
 * project.
 *
 * A block's references are read from two chains of its args fields: its args — current, else
 * the ones validation found errors in — and its prerun args — current, else the ones validation
 * found errors in. Only when neither chain has either are the args of the last run and those of
 * the current staging read in their place: they were derived from earlier data, and their
 * references are not added to those of args derived from the current data. The references of
 * both chains are merged: a column the prerun args pick values of gets them added to the ones
 * the args pick. A block with no args in either chain is skipped. The producer of a referenced column is the block that exports its leaf. A
 * reference is indexed only when the producer is above the dependent block in the project: a
 * column local to the dependent block has no producer, and a producer that is not above cannot
 * be run against — the dependent block already reports such a reference as missing. Dependencies
 * come in project order of the dependent blocks; within one block, the references of its args
 * come first, in the order they hold them, then those only its prerun args hold.
 *
 * @param argsOf args of a block from the given field, `undefined` if the block has no such field.
 *   Asked for a field only when the fields read before it give no args.
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
    const chosen = chooseArgs((field) => ops.argsOf(dependentBlockId, field));
    const references = mergeColumnReferences(
      ...chosen.map((args) => (args === undefined ? [] : ops.referencesOf(args))),
    );
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
 * {@link buildOutputDependencyIndex} over the live project. Reading every block's args fields
 * through `prj` makes a computable that calls it recalculate whenever any block's args or prerun
 * args change or blocks are added, removed or moved.
 */
export function readOutputDependencyIndex(
  prj: PlTreeNodeAccessor,
  projectHelper: ProjectHelper,
): OutputDependencyIndex {
  const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
  return buildOutputDependencyIndex(structure, {
    argsOf: (blockId, field) => readArgsField(prj, blockId, field),
    referencesOf: (args) => projectHelper.getColumnReferences(args.id, () => args.getDataAsJson()),
  });
}

// Internals

/**
 * The args chain and the prerun args chain: the fields derived from the current data, in the
 * order they are read, and the field of the last run or staging read in their place.
 */
const ArgsChains: readonly { current: readonly ArgsField[]; lastRun: ArgsField }[] = [
  { current: ["currentArgs", "currentDraftArgs"], lastRun: "prodArgs" },
  { current: ["currentPrerunArgs", "currentDraftPrerunArgs"], lastRun: "stagingArgs" },
];

/** Args of each chain, `undefined` for a chain without them. */
function chooseArgs<A>(argsOf: (field: ArgsField) => A | undefined): (A | undefined)[] {
  const current = ArgsChains.map((chain) => firstArgs(chain.current, argsOf));
  if (current.some((args) => args !== undefined)) return current;
  return ArgsChains.map((chain) => argsOf(chain.lastRun));
}

function firstArgs<A>(
  chain: readonly ArgsField[],
  argsOf: (field: ArgsField) => A | undefined,
): A | undefined {
  for (const field of chain) {
    const args = argsOf(field);
    if (args !== undefined) return args;
  }
  return undefined;
}

function addDependency(
  index: OutputDependencyIndex,
  producerBlockId: string,
  dependency: OutputDependency,
): void {
  const dependencies = index.get(producerBlockId);
  if (dependencies === undefined) index.set(producerBlockId, [dependency]);
  else dependencies.push(dependency);
}
