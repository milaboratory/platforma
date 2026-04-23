import {
  buildQuery,
  expandAxes,
  collapseAxes,
  findAxis,
  findTableColumn,
} from "@milaboratories/pframes-rs-wasm";
import type {
  AxesId,
  AxesSpec,
  BuildQueryInput,
  PColumnInfo,
  PColumnSpec,
  PFrameSpecDriver,
  PTableColumnId,
  PTableColumnSpec,
  SingleAxisSelector,
  SpecFrameHandle,
  SpecQueryJoinEntry,
  PoolEntry,
  DiscoverColumnsRequest,
  DiscoverColumnsResponse,
  DeleteColumnRequest,
  DeleteColumnResponse,
  EvaluateQueryResponse,
  SpecQuery,
} from "@milaboratories/pl-model-common";
import {
  PFrameSpecDriverError,
  ValueType,
  ensureError,
  resolveAnnotationParents,
} from "@milaboratories/pl-model-common";
import { type MiLogger, ConsoleLoggerAdapter } from "@milaboratories/helpers";
import { PFramePool } from "./pframe_pool";
import { logPFrames } from "./logging";

/**
 * Manages spec-only PFrame instances (WASM) with handle-based lifecycle.
 *
 * All operations are synchronous — WASM computes results immediately.
 */
export class SpecDriver implements PFrameSpecDriver, AsyncDisposable {
  private readonly logger: MiLogger;
  private readonly frames: PFramePool;

  public constructor(options?: { logger?: MiLogger }) {
    this.logger = options?.logger ?? new ConsoleLoggerAdapter();
    this.frames = new PFramePool(this.logger);
  }

  createSpecFrame(specs: Record<string, PColumnSpec>): PoolEntry<SpecFrameHandle> {
    const ValueTypes = new Set(Object.values(ValueType));
    const filtered = Object.fromEntries(
      Object.entries(specs)
        .filter(([, spec]) => ValueTypes.has(spec.valueType))
        .map(([id, spec]) => [id, resolveAnnotationParents(spec)]),
    );
    try {
      if (logPFrames()) {
        this.logger.info(`createSpecFrame: ${Object.keys(filtered).length} columns`);
      }
      return this.frames.acquire(filtered);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`createSpecFrame failed`);
      error.cause = ensureError(err);
      throw error;
    }
  }

  listColumns(handle: SpecFrameHandle): PColumnInfo[] {
    const pframe = this.frames.getByKey(handle);
    try {
      if (logPFrames()) {
        this.logger.info(`listColumns: handle = ${handle}`);
      }
      return pframe.listColumns();
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`listColumns failed`);
      error.cause = new Error(`handle: ${handle}, ` + `error:\n${ensureError(err)}`);
      throw error;
    }
  }

  buildQuery(input: BuildQueryInput): SpecQueryJoinEntry {
    try {
      if (logPFrames()) {
        this.logger.info(`buildQuery: input: ${JSON.stringify(input)}`);
      }
      return buildQuery(input);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`buildQuery failed`);
      error.cause = new Error(`input: ${JSON.stringify(input)}, ` + `error:\n${ensureError(err)}`);
      throw error;
    }
  }

  discoverColumns(
    handle: SpecFrameHandle,
    request: DiscoverColumnsRequest,
  ): DiscoverColumnsResponse {
    const pframe = this.frames.getByKey(handle);
    try {
      if (logPFrames()) {
        this.logger.info(
          `discoverColumns: handle = ${handle}, request: ${JSON.stringify(request)}`,
        );
      }
      const result = pframe.discoverColumns(request);
      return result;
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`discoverColumns failed`);
      error.cause = new Error(
        `handle: ${handle}, ` +
          `request: ${JSON.stringify(request)}, ` +
          `error:\n${ensureError(err)}`,
      );
      throw error;
    }
  }

  deleteColumn(handle: SpecFrameHandle, request: DeleteColumnRequest): DeleteColumnResponse {
    const pframe = this.frames.getByKey(handle);
    try {
      if (logPFrames()) {
        this.logger.info(`deleteColumn: handle = ${handle}, request: ${JSON.stringify(request)}`);
      }
      const result = {
        axes: pframe.deleteColumns({ columns: request.axes, delete: request.delete }).columns,
      };
      return result;
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`deleteColumn failed`);
      error.cause = new Error(
        `handle: ${handle}, ` +
          `request: ${JSON.stringify(request)}, ` +
          `error:\n${ensureError(err)}`,
      );
      throw error;
    }
  }

  evaluateQuery(handle: SpecFrameHandle, request: SpecQuery): EvaluateQueryResponse {
    const pframe = this.frames.getByKey(handle);
    try {
      if (logPFrames()) {
        this.logger.info(`evaluateQuery: handle = ${handle}, request: ${JSON.stringify(request)}`);
      }
      const result = pframe.evaluateQuery(request);
      return result;
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`evaluateQuery failed`);
      error.cause = new Error(
        `handle: ${handle}, ` +
          `request: ${JSON.stringify(request)}, ` +
          `error:\n${ensureError(err)}`,
      );
      throw error;
    }
  }

  expandAxes(spec: AxesSpec): AxesId {
    try {
      return expandAxes(spec);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`expandAxes failed`);
      error.cause = new Error(`spec: ${JSON.stringify(spec)}, ` + `error:\n${ensureError(err)}`);
      throw error;
    }
  }

  collapseAxes(ids: AxesId): AxesSpec {
    try {
      return collapseAxes(ids);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`collapseAxes failed`);
      error.cause = new Error(`ids: ${JSON.stringify(ids)}, ` + `error:\n${ensureError(err)}`);
      throw error;
    }
  }

  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number {
    try {
      return findAxis(spec, selector);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`findAxis failed`);
      error.cause = new Error(
        `spec: ${JSON.stringify(spec)}, ` +
          `selector: ${JSON.stringify(selector)}, ` +
          `error:\n${ensureError(err)}`,
      );
      throw error;
    }
  }

  findTableColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number {
    try {
      return findTableColumn(tableSpec, selector);
    } catch (err: unknown) {
      const error = new PFrameSpecDriverError(`findTableColumn failed`);
      error.cause = new Error(
        `selector: ${JSON.stringify(selector)}, ` + `error:\n${ensureError(err)}`,
      );
      throw error;
    }
  }

  async dispose(): Promise<void> {
    await this.frames.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}
