import type { ComputableCtx } from "@milaboratories/computable";
import type { BlockCodeKnownFeatureFlags } from "@platforma-sdk/model";
import { JsRenderInternal } from "@platforma-sdk/model";
import { notEmpty } from "@milaboratories/ts-helpers";
import { randomUUID } from "node:crypto";
import ivm from "isolated-vm";
import type { BlockContextAny } from "../middle_layer/block_ctx";
import type { MiddleLayerEnvironment } from "../middle_layer/middle_layer";
import { PlSandboxError } from "@milaboratories/pl-errors";
import { ComputableContextHelper } from "./computable_context";

/**
 * Contains references to objects needed to execute lambda within computable,
 * providing access to:
 *  - block context
 *  - computable context
 *  - middle layer environment
 * */
export type ComputableEnv = {
  readonly blockCtx: BlockContextAny;
  readonly mlEnv: MiddleLayerEnvironment;
  computableCtx: ComputableCtx;
};

export class JsExecutionContext {
  private readonly context: ivm.Context;
  private readonly cfgRenderCtxRef: ivm.Reference<Record<string, unknown>>;

  public readonly errorRepo = new ErrorRepository();

  public readonly computableHelper: ComputableContextHelper | undefined;

  /**
   * Creates a new JS execution context.
   *
   * @param isolate - isolated-vm Isolate instance
   * @param timeout - Execution timeout in milliseconds
   * @param featureFlags - Block feature flags
   * @param computableEnv - Optional reactive computable environment (for outputs, inputsValid, etc.)
   */
  constructor(
    public readonly isolate: ivm.Isolate,
    private readonly timeout: number,
    featureFlags: BlockCodeKnownFeatureFlags | undefined,
    computableEnv?: ComputableEnv,
  ) {
    this.context = isolate.createContextSync();

    // Create cfgRenderCtx object with callbackRegistry inside the isolate
    this.context.evalSync(`globalThis.cfgRenderCtx = { callbackRegistry: {} };`, { timeout: 1000 });

    this.cfgRenderCtxRef = this.context.global.getSync("cfgRenderCtx", { reference: true });

    // Inject feature flags
    this.cfgRenderCtxRef.setSync(
      "featureFlags",
      new ivm.ExternalCopy(JsRenderInternal.GlobalCfgRenderCtxFeatureFlags).copyInto(),
    );

    if (computableEnv !== undefined)
      this.computableHelper = new ComputableContextHelper(
        this,
        computableEnv.blockCtx,
        computableEnv.mlEnv,
        featureFlags,
        computableEnv.computableCtx,
      );

    // Inject context values from computableHelper
    if (this.computableHelper !== undefined) {
      this.computableHelper.injectCtx(this.cfgRenderCtxRef);
    }
  }

  public resetComputableCtx() {
    notEmpty(
      this.computableHelper,
      "Computable context helper is not initialized",
    ).resetComputableCtx();
  }

  public evaluateBundle(code: string) {
    this.context.evalSync(code, { filename: "bundle.js", timeout: this.timeout });
  }

  public runCallback(cbName: string, ...args: unknown[]): unknown {
    try {
      const callbackRegistryRef = this.cfgRenderCtxRef.getSync("callbackRegistry", {
        reference: true,
      }) as ivm.Reference<Record<string, unknown>>;
      const callbackRef = callbackRegistryRef.getSync(cbName, { reference: true });

      if (callbackRef.typeof !== "function") throw new Error(`No such callback: ${cbName}`);

      const transferredArgs = args.map((arg) =>
        new ivm.ExternalCopy(arg === undefined ? null : arg).copyInto(),
      );

      return callbackRef.applySync(undefined, transferredArgs, {
        timeout: this.timeout,
        result: { copy: true },
      });
    } catch (err: unknown) {
      const original = this.errorRepo.getOriginal(err);
      throw original;
    }
  }

  /**
   * Runs a callback and returns a Reference to the result inside the isolate,
   * allowing later reads after mutations (for async Computable pattern).
   */
  public runCallbackRef(cbName: string, ...args: unknown[]): ivm.Reference<unknown> {
    try {
      const callbackRegistryRef = this.cfgRenderCtxRef.getSync("callbackRegistry", {
        reference: true,
      }) as ivm.Reference<Record<string, unknown>>;
      const callbackRef = callbackRegistryRef.getSync(cbName, { reference: true });

      if (callbackRef.typeof !== "function") throw new Error(`No such callback: ${cbName}`);

      const transferredArgs = args.map((arg) =>
        new ivm.ExternalCopy(arg === undefined ? null : arg).copyInto(),
      );

      return callbackRef.applySync(undefined, transferredArgs, {
        timeout: this.timeout,
        result: { reference: true },
      }) as ivm.Reference<unknown>;
    } catch (err: unknown) {
      const original = this.errorRepo.getOriginal(err);
      throw original;
    }
  }

  /**
   * Reads a value from a Reference by JSON-serializing inside the isolate and parsing on host.
   * This handles complex objects that may not be directly copyable.
   */
  public importFromRef(ref: ivm.Reference<unknown>): unknown {
    // Use copySync() to deep-copy the value from the isolate to the host
    try {
      return ref.copySync();
    } catch {
      // If copySync fails (e.g. non-transferable value), fall back to JSON roundtrip
      this.context.global.setSync("__importTemp", ref.derefInto());
      try {
        const json = this.context.evalSync(
          `(() => { const v = __importTemp; return v === undefined ? '__undefined__' : JSON.stringify(v); })()`,
          { timeout: this.timeout, copy: true },
        ) as string;
        if (json === "__undefined__") return undefined;
        return JSON.parse(json);
      } finally {
        this.context.evalSync(`delete globalThis.__importTemp;`, { timeout: 1000 });
      }
    }
  }

  /** Getter for the cfgRenderCtx reference */
  public get cfgRef(): ivm.Reference<Record<string, unknown>> {
    return this.cfgRenderCtxRef;
  }

  /** Getter for the context */
  public get ctx(): ivm.Context {
    return this.context;
  }

  public dispose() {
    try {
      this.context.release();
    } catch {
      // context may already be released
    }
    try {
      if (!this.isolate.isDisposed) {
        this.isolate.dispose();
      }
    } catch {
      // isolate may already be disposed
    }
  }
}

/** Holds errors that happened in the host code (like in middle-layer's drivers)
 * and then throws it where the error from the sandbox is needed.
 * The sandbox couldn't throw custom errors, so we store them here, and rethrow them when we exit sandbox side. */
export class ErrorRepository {
  private readonly errorIdToError = new Map<string, unknown>();

  /** Sets the error to the repository and returns a recreated error with uuid key of the original error. */
  public setAndRecreateForSandbox(error: unknown): Error {
    const errorId = randomUUID();
    this.errorIdToError.set(errorId, error);

    if (error instanceof Error) {
      const err = new Error(error.message);
      err.name = `${error.name}/uuid:${errorId}`;
      return err;
    }

    const err = new Error(`${error as any}`);
    err.name = `UnknownErrorSandbox/uuid:${errorId}`;
    return err;
  }

  /** Returns the original error that was stored by parsing uuid of the sandbox error. */
  public getOriginal(sandboxError: unknown): unknown {
    if (!(sandboxError instanceof Error)) {
      return sandboxError;
    }

    // Check if the error message or the error itself contains a /uuid: pattern
    // isolated-vm wraps errors from callbacks into Error objects
    const errorStr = sandboxError.message ?? "";
    const uuidMatch = errorStr.match(/\/uuid:([0-9a-f-]+)/);
    if (!uuidMatch) {
      // Try the name field as well
      const nameStr = sandboxError.name ?? "";
      const nameMatch = nameStr.match(/\/uuid:([0-9a-f-]+)/);
      if (!nameMatch) {
        return sandboxError;
      }
      const errorId = nameMatch[1];
      const error = this.errorIdToError.get(errorId);
      if (error === undefined) {
        return sandboxError;
      }
      return new PlSandboxError(sandboxError, error as Error);
    }

    const errorId = uuidMatch[1];
    const error = this.errorIdToError.get(errorId);
    if (error === undefined) {
      return sandboxError;
    }

    return new PlSandboxError(sandboxError, error as Error);
  }
}
