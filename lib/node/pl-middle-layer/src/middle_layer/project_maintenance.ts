import { Computable } from "@milaboratories/computable";
import { isNotFoundError, isTimeoutOrCancelError } from "@milaboratories/pl-client";
import type { PlTreeEntry, PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import {
  createInfiniteRetryState,
  nextInfiniteRetryState,
  notEmpty,
  type InfiniteRetryState,
  type MiLogger,
} from "@milaboratories/ts-helpers";
import { isEqual } from "es-toolkit";
import { setTimeout } from "node:timers/promises";
import type { ProjectField, ProjectStructure } from "../model/project_model";
import { projectFieldName, ProjectStructureKey } from "../model/project_model";
import { allBlocks } from "../model/project_model_util";

/**
 * What a maintenance pass over the project would do, as the project tree shows it.
 *
 * A pass renders the staging of blocks that have prerun args but no staging, and drops the
 * outputs of an earlier render that are kept only until the current render is ready. The
 * reading may over-report (a pass then finds nothing to do and commits nothing), but never
 * under-reports.
 */
export type ProjectMaintenanceWork =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pending";
      /** Blocks whose staging is to be rendered. */
      readonly stagingToRender: readonly string[];
      /** Blocks holding outputs of an earlier render whose replacement is ready. */
      readonly previousToDrop: readonly string[];
    };

/** The project's blocks and the maintenance work it has. */
export type ProjectMaintenanceState = {
  readonly blockIds: readonly string[];
  readonly work: ProjectMaintenanceWork;
};

/** Reads {@link ProjectMaintenanceState} from the project tree. */
export function projectMaintenanceState(
  prjEntry: PlTreeEntry,
): Computable<ProjectMaintenanceState> {
  return Computable.make((ctx) => {
    const prj = ctx.accessor(prjEntry).node();
    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
    const fields = new Set(prj.listDynamicFields());

    const blockIds: string[] = [];
    const stagingToRender: string[] = [];
    const previousToDrop: string[] = [];
    for (const { id } of allBlocks(structure)) {
      blockIds.push(id);
      if (requiresStagingRendering(fields, id)) stagingToRender.push(id);
      if (hasPreviousToDrop(prj, fields, id)) previousToDrop.push(id);
    }

    const work: ProjectMaintenanceWork =
      stagingToRender.length === 0 && previousToDrop.length === 0
        ? { kind: "idle" }
        : { kind: "pending", stagingToRender, previousToDrop };
    return { blockIds, work };
  });
}

/** What {@link runProjectMaintenance} works with. */
export type ProjectMaintenanceOps = {
  /** Reads the current state without asking the tree to refresh. */
  readonly readState: () => Promise<ProjectMaintenanceState>;
  /** Resolves when the state may have changed, without asking the tree to refresh. */
  readonly awaitStateChange: (signal: AbortSignal) => Promise<void>;
  /** Runs one maintenance transaction and makes its result visible to {@link readState}. */
  readonly runPass: (signal: AbortSignal) => Promise<void>;
  /** Called with the blocks that left the project since the previous reading. */
  readonly onBlocksDeleted: (blockIds: readonly string[]) => void;
  readonly signal: AbortSignal;
  readonly logger: MiLogger;
};

/**
 * Keeps the project maintained until the signal aborts or the project is deleted.
 *
 * Runs a pass only while the state shows pending work. A pass that leaves the work exactly as it
 * found it (a block whose staging cannot render, say) is not repeated until the work changes, so
 * a stuck block costs one transaction per change of the project, not a busy loop. With no work,
 * it waits for the tree to change, and the wait does not keep the tree polling.
 */
export async function runProjectMaintenance(ops: ProjectMaintenanceOps): Promise<void> {
  const { signal, logger } = ops;
  let retryState: InfiniteRetryState | undefined;
  let knownBlockIds: ReadonlySet<string> | undefined;
  let lastPassWork: ProjectMaintenanceWork | undefined;

  while (!signal.aborted) {
    try {
      const state = await ops.readState();

      if (knownBlockIds !== undefined) {
        const current = new Set(state.blockIds);
        const deleted = [...knownBlockIds].filter((id) => !current.has(id));
        if (deleted.length > 0) ops.onBlocksDeleted(deleted);
      }
      knownBlockIds = new Set(state.blockIds);

      if (state.work.kind === "pending" && !isEqual(state.work, lastPassWork)) {
        await ops.runPass(signal);
        // only a pass that ran through counts: a failed one is retried
        lastPassWork = state.work;
      } else {
        await ops.awaitStateChange(signal);
      }
      retryState = undefined;
    } catch (error: unknown) {
      if (signal.aborted) break;

      if (isNotFoundError(error)) {
        logger.warn("project maintenance terminated, because project was externally deleted");
        break;
      }
      if (isTimeoutOrCancelError(error)) continue;

      retryState =
        retryState === undefined
          ? createInfiniteRetryState(MaintenanceRetry)
          : nextInfiniteRetryState(retryState);
      logger.error(
        new Error(
          `[projectMaintenance] unexpected exception, retrying in ${retryState.nextDelay}ms`,
          { cause: error },
        ),
      );
      try {
        await setTimeout(retryState.nextDelay, undefined, { signal });
      } catch {
        break;
      }
    }
  }
}

// Internals

const MaintenanceRetry = {
  type: "exponentialWithMaxDelayBackoff",
  initialDelay: 1000,
  maxDelay: 60_000,
  backoffMultiplier: 2,
  jitter: 0,
} as const;

const StagingFields = ["stagingCtx", "stagingOutput", "stagingUiCtx"] as const;
const ProdPreviousFields = ["prodOutputPrevious", "prodCtxPrevious", "prodUiCtxPrevious"] as const;
const StagingPreviousFields = [
  "stagingOutputPrevious",
  "stagingCtxPrevious",
  "stagingUiCtxPrevious",
] as const;

function hasField(
  fields: ReadonlySet<string>,
  blockId: string,
  fieldName: ProjectField["fieldName"],
): boolean {
  return fields.has(projectFieldName(blockId, fieldName));
}

/** A block with prerun args gets a staging; an incomplete staging is dropped and rendered anew. */
function requiresStagingRendering(fields: ReadonlySet<string>, blockId: string): boolean {
  if (!hasField(fields, blockId, "currentPrerunArgs")) return false;
  return StagingFields.some((f) => !hasField(fields, blockId, f));
}

/** Outputs of an earlier render go once both the context and the output of the render that
 * replaced it are ready without an error. */
function hasPreviousToDrop(
  prj: PlTreeNodeAccessor,
  fields: ReadonlySet<string>,
  blockId: string,
): boolean {
  const prodPrevious = ProdPreviousFields.some((f) => hasField(fields, blockId, f));
  if (
    prodPrevious &&
    isFieldValueReady(prj, blockId, "prodCtx") &&
    isFieldValueReady(prj, blockId, "prodOutput")
  )
    return true;

  const stagingPrevious = StagingPreviousFields.some((f) => hasField(fields, blockId, f));
  return (
    stagingPrevious &&
    isFieldValueReady(prj, blockId, "stagingCtx") &&
    isFieldValueReady(prj, blockId, "stagingOutput")
  );
}

function isFieldValueReady(
  prj: PlTreeNodeAccessor,
  blockId: string,
  fieldName: ProjectField["fieldName"],
): boolean {
  try {
    const value = prj.getField({
      field: projectFieldName(blockId, fieldName),
      assertFieldType: "Dynamic",
      stableIfNotFound: true,
    })?.value;
    if (value === undefined) return false;
    return value.getIsReadyOrError() && value.getError() === undefined;
  } catch {
    // A resource the mirror does not hold yet: counted as ready, so the pass decides.
    return true;
  }
}
