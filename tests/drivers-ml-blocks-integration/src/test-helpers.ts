import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import * as fsp from "node:fs/promises";
import path from "node:path";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import { Computable } from "@milaboratories/computable";
import type { ResourceType } from "@milaboratories/pl-client";
import { ensureError } from "@milaboratories/pl-middle-layer";
import type {
  ProjectField,
  PlRef,
  Project,
  BlockStateInternalV3,
} from "@milaboratories/pl-middle-layer";
import { z } from "zod";
import type { BlockDumpUnified } from "./unified-state-schema";

/** Simple types that should not be recursively expanded */
const SIMPLE_TYPES = new Set(["json/object", "Null", "BinaryValue"]);

/** Types that are known to be blobs (just show metadata) */
const BLOB_TYPES_PREFIX = ["Blob"];

export type DumpedNode = {
  type: ResourceType;
  data?: unknown;
  inputs?: Record<string, DumpedNode>;
  outputs?: Record<string, DumpedNode>;
  dynamics?: Record<string, DumpedNode>;
  error?: string;
};

/** Zod schema for ResourceType */
const ResourceTypeSchema = z.object({
  name: z.string(),
  version: z.string(),
});

/** Zod schema for DumpedNode (recursive) */
const DumpedNodeSchema: z.ZodType<DumpedNode> = z.lazy(() =>
  z.object({
    type: ResourceTypeSchema,
    data: z.unknown().optional(),
    inputs: z.record(z.string(), DumpedNodeSchema).optional(),
    outputs: z.record(z.string(), DumpedNodeSchema).optional(),
    dynamics: z.record(z.string(), DumpedNodeSchema).optional(),
    error: z.string().optional(),
  }),
);

/**
 * Recursively dumps a resource tree node, expanding any non-simple types.
 * @param node - The node accessor to dump
 * @param maxDepth - Maximum recursion depth (default 10)
 * @param currentDepth - Current recursion depth (internal use)
 */
export function dumpNodeRecursive(
  node: PlTreeNodeAccessor,
  maxDepth: number = 10,
  currentDepth: number = 0,
): DumpedNode {
  const typeName = node.resourceType.name;

  // Build base result
  const result: DumpedNode = {
    type: node.resourceType,
  };

  // Check for error
  const errorNode = node.getError();
  if (errorNode) {
    result.error = errorNode.getDataAsString();
  }

  // Add data for simple types or as base info
  try {
    const data = node.getDataAsJson();
    if (data !== undefined) {
      result.data = data;
    }
  } catch {
    // If JSON parsing fails, try string
    const dataStr = node.getDataAsString();
    if (dataStr !== undefined) {
      result.data = dataStr;
    }
  }

  // Check if we should stop recursion
  if (currentDepth >= maxDepth) {
    result.data = `[MAX_DEPTH_REACHED: ${typeName}]`;
    return result;
  }

  // Simple types - no recursion needed
  if (SIMPLE_TYPES.has(typeName)) {
    return result;
  }

  // Blob types - just return type info, no recursion
  if (BLOB_TYPES_PREFIX.some((prefix) => typeName.startsWith(prefix))) {
    return result;
  }

  // For map types or any type with fields, recursively expand
  const inputFields = node.listInputFields();
  const outputFields = node.listOutputFields();
  const dynamicFields = node.listDynamicFields();

  if (inputFields.length > 0) {
    result.inputs = {};
    for (const field of inputFields) {
      try {
        const childNode = node.traverse({
          field,
          assertFieldType: "Input",
          stableIfNotFound: true,
          ignoreError: true,
        });
        if (childNode) {
          result.inputs[field] = dumpNodeRecursive(childNode, maxDepth, currentDepth + 1);
        }
      } catch (e) {
        result.inputs[field] = { type: { name: "Error", version: "1" }, error: String(e) };
      }
    }
  }

  if (outputFields.length > 0) {
    result.outputs = {};
    for (const field of outputFields) {
      try {
        const childNode = node.traverse({
          field,
          assertFieldType: "Output",
          stableIfNotFound: true,
          ignoreError: true,
        });
        if (childNode) {
          result.outputs[field] = dumpNodeRecursive(childNode, maxDepth, currentDepth + 1);
        }
      } catch (e) {
        result.outputs[field] = { type: { name: "Error", version: "1" }, error: String(e) };
      }
    }
  }

  if (dynamicFields.length > 0) {
    result.dynamics = {};
    for (const field of dynamicFields) {
      try {
        const childNode = node.traverse({
          field,
          assertFieldType: "Dynamic",
          stableIfNotFound: true,
          ignoreError: true,
        });
        if (childNode) {
          result.dynamics[field] = dumpNodeRecursive(childNode, maxDepth, currentDepth + 1);
        }
      } catch (e) {
        result.dynamics[field] = { type: { name: "Error", version: "1" }, error: String(e) };
      }
    }
  }

  return result;
}

export function projectFieldName(blockId: string, fieldName: ProjectField["fieldName"]): string {
  return `${blockId}-${fieldName}`;
}

export async function awaitBlockDone(prj: Project, blockId: string, timeout: number = 5000) {
  const abortSignal = AbortSignal.timeout(timeout);
  const overview = prj.overview;
  const state = prj.getBlockState(blockId);
  while (true) {
    const overviewSnapshot = (await overview.getValue())!;
    const blockOverview = overviewSnapshot.blocks.find((b) => b.id == blockId);
    if (blockOverview === undefined) throw new Error(`Blocks not found: ${blockId}`);
    if (blockOverview.outputErrors) return;
    if (blockOverview.calculationStatus === "Done") return;
    try {
      await overview.awaitChange(abortSignal);
    } catch (e: any) {
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error("Aborted.", { cause: e });
    }
  }
}

export async function awaitComputableChangeAndLog<V = unknown>(
  c: Computable<V>,
  onNext: (result: V) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  while (true) {
    await c.awaitChange(abortSignal);
    const result = (await c.getValue()) as V;
    onNext(result);
  }
}

export type ProjectDump =
  | {
      project: { field: string; value: string | undefined }[];
      blocks: BlockDumpUnified[] | undefined;
    }
  | undefined;

const fieldsToTraverse: ProjectField["fieldName"][] = [
  "blockSettings",
  "blockStorage",
  "prodArgs",
  "currentArgs",
  "prodCtx",
  "prodUiCtx",
  "prodOutput",
  "prodCtxPrevious",
  "prodUiCtxPrevious",
  "prodOutputPrevious",
  "stagingCtx",
  "stagingUiCtx",
  "stagingOutput",
  "stagingCtxPrevious",
  "stagingUiCtxPrevious",
  "stagingOutputPrevious",
];

export async function createProjectWatcher<Dump>(
  ml: MiddleLayer,
  prj: Project,
  options?: {
    workFolder?: string;
    onNext?: (result: Dump[]) => void;
    validator?: z.ZodType<Dump[]>;
  },
) {
  const abortController = new AbortController();
  let dumpSequence = 0;

  // Create dumps folder inside the work folder (or default to relative path from this file)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseFolder = options?.workFolder ?? path.resolve(import.meta.dirname, "..", "work");
  const dumpsPath = path.resolve(baseFolder, `dumps-${timestamp}`);
  await fsp.mkdir(dumpsPath, { recursive: true });
  console.log(`Dumps will be written to: ${dumpsPath}`);

  const state = {
    dump: undefined as ProjectDump | undefined,
  };

  const projectTree = await SynchronizedTreeState.init(
    ml.pl,
    prj.rid,
    {
      stopPollingDelay: 10,
      pollingInterval: 10,
    },
    console,
  );

  const overview = await prj.overview.awaitStableValue();

  const blockIds = overview.blocks.map((b) => b.id);

  const blocksComputable = Computable.make<ProjectDump | undefined>((ctx) => {
    const node = ctx.accessor(projectTree.entry()).node();
    if (node === undefined) return undefined;

    const fields = node.listDynamicFields();

    const project = fields.map((field) => {
      return {
        field,
        value: node
          .traverse({ field, stableIfNotFound: true, ignoreError: true })
          ?.getDataAsString(),
      };
    });

    const blocks = blockIds.map((blockId) => {
      const blockState = Object.fromEntries(
        fieldsToTraverse.map((fieldName) => {
          const fieldNode = node.traverse({
            field: projectFieldName(blockId, fieldName),
            stableIfNotFound: true,
            ignoreError: true,
          });
          return [fieldName, fieldNode ? dumpNodeRecursive(fieldNode) : undefined];
        }),
      ) as Omit<BlockDumpUnified, "blockId">;

      return {
        blockId,
        ...blockState,
      } as BlockDumpUnified;
    });

    return {
      project,
      blocks,
    };
  });

  // Replacer to filter out large code content and other verbose fields
  const sanitizeForDump = (key: string, value: unknown): unknown => {
    if (key === "content" && typeof value === "string" && value.length > 200) {
      // Check if it looks like JS code
      if (value.includes("function") || value.includes("exports")) {
        return "<model js code>";
      }
      return `<string, ${value.length} chars>`;
    }
    return value;
  };

  const writeDump = async (result: unknown) => {
    const seq = String(dumpSequence++).padStart(4, "0");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `dump-${seq}-${timestamp}.json`;
    const filepath = path.join(dumpsPath, filename);
    await fsp.writeFile(filepath, JSON.stringify(result, sanitizeForDump, 2));
    // console.log(`Dump written: ${filename}`);
  };

  type BlockDumpPresent = NonNullable<BlockDumpUnified>;
  type BlockDumpPredicate = (dump: BlockDumpUnified) => boolean;
  type Waiter = {
    blockId: string;
    predicate: BlockDumpPredicate;
    resolve: (dump: BlockDumpPresent) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  };
  const waiters = new Set<Waiter>();

  const getBlockDump = (blockId: string): BlockDumpUnified => {
    return state.dump?.blocks?.find((b) => b?.blockId === blockId);
  };

  const resolveMatchingWaiters = () => {
    for (const w of waiters) {
      const dump = getBlockDump(w.blockId);
      let matches = false;
      try {
        matches = w.predicate(dump);
      } catch (e) {
        clearTimeout(w.timer);
        waiters.delete(w);
        w.reject(e instanceof Error ? e : new Error(String(e)));
        continue;
      }
      if (matches && dump !== undefined) {
        clearTimeout(w.timer);
        waiters.delete(w);
        w.resolve(dump);
      }
    }
  };

  const end = awaitComputableChangeAndLog<ProjectDump | undefined>(
    blocksComputable,
    (result) => {
      writeDump(result).catch(console.error);
      state.dump = result;
      if (result !== undefined) {
        // Validate the block dump if a validator is provided
        if (options?.validator) {
          const parseResult = options.validator.safeParse(result.blocks);
          if (!parseResult.success) {
            console.error(parseResult.error.message);
            // throw new Error(
            //   `Block dump validation failed: ${parseResult.error.message}`,
            //   { cause: parseResult.error }
            // );
          }
        }
      }
      resolveMatchingWaiters();
    },
    abortController.signal,
  );

  return {
    dumpsPath,
    get dump(): ProjectDump | undefined {
      return state.dump;
    },
    getBlockDump,
    /**
     * Resolves with the block dump the first time `predicate(getBlockDump(blockId))`
     * returns true. Hooks the internal blocksComputable change loop, so it reacts
     * as soon as state.dump updates — no extra polling.
     *
     * Use this instead of fixed setTimeout sleeps: the watcher tree is independent
     * from prj.projectTree and may lag the canonical project state.
     */
    waitForBlockDump: (
      blockId: string,
      predicate: BlockDumpPredicate,
      waitOptions?: { timeoutMs?: number },
    ): Promise<BlockDumpPresent> => {
      const timeoutMs = waitOptions?.timeoutMs ?? 5000;

      // Fast path: condition already satisfied against the current dump
      const current = getBlockDump(blockId);
      try {
        if (current !== undefined && predicate(current)) return Promise.resolve(current);
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }

      return new Promise<BlockDumpPresent>((resolve, reject) => {
        const waiter: Waiter = {
          blockId,
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            const last = getBlockDump(blockId);
            const lastVersion = (last?.blockStorage?.data as Record<string, unknown> | undefined)
              ?.__dataVersion;
            reject(
              new Error(
                `waitForBlockDump(${blockId}) timed out after ${timeoutMs}ms; ` +
                  `last __dataVersion=${JSON.stringify(lastVersion)}`,
              ),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
    abort: async (): Promise<void> => {
      abortController.abort();
      for (const w of waiters) {
        clearTimeout(w.timer);
        w.reject(new Error("createProjectWatcher aborted while waitForBlockDump was pending"));
      }
      waiters.clear();
      try {
        await end;
      } catch (e: unknown) {
        if (ensureError(e).name === "AbortError") {
          console.log("AbortError caught, aborting");
          return;
        }
        throw e;
      }
    },
  };
}

export function outputRef(blockId: string, name: string, requireEnrichments?: true): PlRef {
  return { __isRef: true, blockId, name, requireEnrichments };
}

/**
 * Awaits until block state becomes stable (staging outputs are ready).
 * This waits for all outputs to resolve, including those that depend on staging/prerun.
 */
export async function awaitBlockStateStable(
  prj: Project,
  blockId: string,
  timeout: number = 5000,
): Promise<BlockStateInternalV3> {
  const abortSignal = AbortSignal.timeout(timeout);
  const blockState = prj.getBlockState(blockId);
  await blockState.awaitStableValue(abortSignal);
  return await blockState.getValue();
}
