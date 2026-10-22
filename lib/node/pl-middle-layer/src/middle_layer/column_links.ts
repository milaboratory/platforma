import { Computable } from "@milaboratories/computable";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { notEmpty } from "@milaboratories/ts-helpers";
import {
  computeDependencies,
  computeDependents,
  labelColumnLinks,
  type BlockColumnLinks,
  type ColumnLinksSource,
  type ProducerRun,
  type UnlabeledDependencies,
  type UnlabeledDependents,
} from "@milaboratories/pl-model-common";
import type { BlockStateOverview } from "@milaboratories/pl-model-middle-layer";
import type { ProjectStructure } from "../model/project_model";
import { ProjectStructureKey, projectFieldName } from "../model/project_model";
import { allBlocks } from "../model/project_model_util";
import type { MiddleLayerEnvironment } from "./middle_layer";

/** What the column links computables read besides the project tree. */
export type ColumnLinksEnv = Pick<MiddleLayerEnvironment, "projectHelper" | "logger">;

/**
 * Outputs of other blocks that the args of the block reference, checked against what the last
 * runs of their producers export; `undefined` when they could not be computed. Reads the order
 * of the blocks, the args of the block, and of each producer above it that the args reference:
 * whether it has a last run, the results of that run as far as the referenced columns go, and,
 * only to label a column the run does not export, the results the producer prepares before it
 * is run.
 */
export function blockDependencies(
  prjEntry: PlTreeEntry,
  blockId: string,
  env: ColumnLinksEnv,
): Computable<UnlabeledDependencies | undefined> {
  return Computable.make(
    (ctx) => computeDependencies(columnLinksSource(ctx.accessor(prjEntry).node(), env), blockId),
    { recover: forgetFailed(env, "dependencies") },
  );
}

/**
 * Blocks whose args reference outputs of the block, each reference checked against what the
 * last run of the block exports; `undefined` when they could not be computed. Reads the order of
 * the blocks, the args of the block and of every block below it, and of the block's own runs:
 * whether it has a last run, the results of that run as far as the referenced columns go, and,
 * only to label a column the run does not export, the results it prepares before it is run.
 */
export function blockDependents(
  prjEntry: PlTreeEntry,
  blockId: string,
  env: ColumnLinksEnv,
): Computable<UnlabeledDependents | undefined> {
  return Computable.make(
    (ctx) => computeDependents(columnLinksSource(ctx.accessor(prjEntry).node(), env), blockId),
    { recover: forgetFailed(env, "dependents") },
  );
}

/**
 * Column links of a block with the blocks they name labelled by their titles in the project
 * overview, the names the project shows; a block the overview has no title for stays unlabelled.
 * `undefined` while either side is not computed.
 */
export function labelBlockColumnLinks(
  links: {
    blockId: string;
    dependencies: UnlabeledDependencies | undefined;
    dependents: UnlabeledDependents | undefined;
  },
  blocks: readonly Pick<BlockStateOverview, "id" | "title">[],
): BlockColumnLinks | undefined {
  const { blockId, dependencies, dependents } = links;
  if (dependencies === undefined || dependents === undefined) return undefined;
  return labelColumnLinks({ blockId, dependencies, dependents }, (namedId) => {
    const title = blocks.find((block) => block.id === namedId)?.title;
    if (title === undefined) throw new Error(`No title for block ${namedId}`);
    return title;
  });
}

// Internals

/** Logs why a side of the column links failed; the side is then not computed. */
function forgetFailed(env: ColumnLinksEnv, side: "dependencies" | "dependents") {
  return (cause: unknown[]): undefined => {
    env.logger.error(new Error(`Error in column links: ${side}`, { cause }));
    return undefined;
  };
}

function columnLinksSource(
  prj: PlTreeNodeAccessor,
  env: ColumnLinksEnv,
): ColumnLinksSource<PlTreeNodeAccessor> {
  const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
  return {
    blockIds: [...allBlocks(structure)].map(({ id }) => id),
    argsOf: (blockId, which) => readArgs(prj, blockId, which)?.getDataAsJson(),
    referencesOf: (blockId, which) => {
      const args = readArgs(prj, blockId, which);
      if (args === undefined) return [];
      return env.projectHelper.getColumnReferences(args.id, () => args.getDataAsJson());
    },
    lastRunOf: (blockId) => readLastRun(prj, blockId),
    stagingOf: (blockId) => readStaging(prj, blockId),
  };
}

/** The project field holding a block's args of each kind. */
const ARGS_FIELD = { current: "currentArgs", lastRun: "prodArgs" } as const;

function readArgs(
  prj: PlTreeNodeAccessor,
  blockId: string,
  which: "current" | "lastRun",
): undefined | PlTreeNodeAccessor {
  return prj.traverse({
    field: projectFieldName(blockId, ARGS_FIELD[which]),
    assertFieldType: "Dynamic",
    stableIfNotFound: true,
  });
}

/**
 * A block has a last run while it holds the args of that run. The results of the run fail to
 * render when their field, or the result list itself, has an error.
 */
function readLastRun(prj: PlTreeNodeAccessor, blockId: string): ProducerRun<PlTreeNodeAccessor> {
  if (readArgs(prj, blockId, "lastRun") === undefined) return { type: "notRun" };
  const ctx = prj.traverseOrError({
    field: projectFieldName(blockId, "prodUiCtx"),
    stableIfNotFound: true,
  });
  if (ctx === undefined) return { type: "rendering" };
  if (!ctx.ok || ctx.value.getError() !== undefined) return { type: "failed" };
  return { type: "rendered", ctx: ctx.value };
}

/** The results a block prepares before it is run; `undefined` while there are none, or they failed. */
function readStaging(prj: PlTreeNodeAccessor, blockId: string): undefined | PlTreeNodeAccessor {
  const ctx = prj.traverseOrError({
    field: projectFieldName(blockId, "stagingUiCtx"),
    stableIfNotFound: true,
  });
  return ctx !== undefined && ctx.ok ? ctx.value : undefined;
}
