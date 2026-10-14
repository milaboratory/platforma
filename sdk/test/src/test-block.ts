import path from "node:path";
import * as fsp from "node:fs/promises";
import type {
  InferBlockState,
  LocalImportFileHandle,
  MiddleLayer,
  Platforma,
  Project,
} from "@milaboratories/pl-middle-layer";
import { MiddleLayer as MiddleLayerImpl } from "@milaboratories/pl-middle-layer";
import { registerServiceCapabilities } from "@platforma-sdk/model";
import { plTest } from "./test-pl";
import { awaitStableState, sleep } from "./util";

export type AwaitBlockDoneOps = {
  timeout?: number | AbortSignal;
  ignoreBlockError?: boolean;
  /**
   * Keep the block's state observed while waiting. A lazy-state block renders its outputs
   * only while something reads its state, and an output such as `fileUploader` is what
   * schedules a local-file upload (and releases it once unobserved), so a block that
   * uploads a file never finishes under a wait on the project overview alone.
   */
  observeState?: boolean;
  /** Poll period in observed mode, ms. */
  pollInterval?: number;
};

export type AwaitBlockDoneNormalized = {
  timeout: AbortSignal;
  ignoreBlockError: boolean;
  observeState: boolean;
  pollInterval: number;
};

function normalizeABDOpts(timeoutOrOps?: number | AwaitBlockDoneOps): AwaitBlockDoneNormalized {
  let ops: AwaitBlockDoneOps = {};
  if (timeoutOrOps !== undefined) {
    if (typeof timeoutOrOps === "object" && !(timeoutOrOps instanceof AbortSignal))
      ops = { ...ops, ...timeoutOrOps };
    else ops.timeout = timeoutOrOps;
  }
  const abortSignal =
    typeof ops.timeout === "undefined"
      ? AbortSignal.timeout(DEFAULT_AWAIT_BLOCK_DONE_TIMEOUT)
      : typeof ops.timeout === "number"
        ? AbortSignal.timeout(ops.timeout)
        : ops.timeout;
  return {
    timeout: abortSignal,
    ignoreBlockError: Boolean(ops.ignoreBlockError),
    observeState: Boolean(ops.observeState),
    pollInterval: ops.pollInterval ?? DEFAULT_AWAIT_BLOCK_DONE_POLL_INTERVAL,
  };
}

export const DEFAULT_AWAIT_BLOCK_DONE_TIMEOUT = 5000;
export const DEFAULT_AWAIT_BLOCK_DONE_POLL_INTERVAL = 1000;

/**
 * Wait until the block reports `Done` on the project overview. Pass `observeState: true`
 * for a block that uploads a local file (see `AwaitBlockDoneOps`).
 */
export async function awaitBlockDone(
  prj: Project,
  blockId: string,
  timeoutOrOps?: number | AwaitBlockDoneOps,
): Promise<void> {
  const ops = normalizeABDOpts(timeoutOrOps);
  const overview = prj.overview;
  const state = prj.getBlockState(blockId);
  while (true) {
    if (ops.observeState) await state.getValue();
    const overviewSnapshot = (await overview.getValue())!;
    const blockOverview = overviewSnapshot.blocks.find((b) => b.id == blockId);
    if (blockOverview === undefined) throw new Error(`Blocks not found: ${blockId}`);
    if (blockOverview.outputErrors) {
      if (ops.ignoreBlockError) return;
      else {
        let errorMessage = blockOverview.outputsError;
        if (errorMessage === undefined) errorMessage = blockOverview.exportsError;
        throw new Error("Block error: " + (errorMessage ?? "no message"));
      }
    }
    if (blockOverview.calculationStatus === "Done") return;
    if (blockOverview.calculationStatus !== "Running")
      throw new Error(
        `Unexpected block status, block not calculating anything at the moment: ${blockOverview.calculationStatus}`,
      );
    if (ops.timeout.aborted) {
      console.dir(blockOverview, { depth: 5 });
      throw new Error(`Block ${blockId} did not reach Done before the timeout.`);
    }
    if (ops.observeState) {
      // The state read above is what keeps the block's outputs rendering, so wait a fixed
      // period and read again instead of waiting for the next overview change.
      await sleep(ops.pollInterval);
      continue;
    }
    try {
      await overview.awaitChange(ops.timeout);
    } catch (e: any) {
      console.dir(blockOverview, { depth: 5 });
      console.dir(await state.getValue(), { depth: 5 });
      throw new Error("Aborted while awaiting block done.", { cause: e });
    }
  }
}

export interface RawHelpers {
  awaitBlockDone(blockId: string, timeoutOrOps?: number | AwaitBlockDoneOps): Promise<void>;
  awaitBlockDoneAndGetStableBlockState<Pl extends Platforma>(
    blockId: string,
    timeoutOrOps?: number | AwaitBlockDoneOps,
  ): Promise<InferBlockState<Pl>>;
  getLocalFileHandle(localPath: string): Promise<LocalImportFileHandle>;
}

export function createRawHelpers(ml: MiddleLayer, rawPrj: Project): RawHelpers {
  return {
    async awaitBlockDone(blockId, timeout) {
      await awaitBlockDone(rawPrj, blockId, timeout);
    },
    awaitBlockDoneAndGetStableBlockState: async <Pl extends Platforma>(
      blockId: string,
      timeoutOrOps?: number | AwaitBlockDoneOps,
    ) => {
      const ops = normalizeABDOpts(timeoutOrOps);
      await awaitBlockDone(rawPrj, blockId, ops);
      return (await awaitStableState(
        rawPrj.getBlockState(blockId),
        ops.timeout,
      )) as InferBlockState<Pl>;
    },
    async getLocalFileHandle(localPath) {
      return await ml.internalDriverKit.lsDriver.getLocalFileHandle(path.resolve(localPath));
    },
  };
}

/** Everything a test needs to drive blocks in one open project. */
export type BlockTestCtx = {
  rawPrj: Project;
  ml: MiddleLayer;
  helpers: RawHelpers;
  /** Scratch folder for files the test uploads; removed with the fixture that owns it. */
  tmpFolder: string;
};

export type MiddleLayerInitOps = Parameters<typeof MiddleLayerImpl.init>[2];

/** Start a middle layer for tests, with the UI API versions blocks require registered. */
export async function initTestMiddleLayer(
  pl: Parameters<typeof MiddleLayerImpl.init>[0],
  tmpFolder: string,
  ops: Partial<MiddleLayerInitOps> = {},
): Promise<MiddleLayer> {
  await fsp.mkdir(path.join(tmpFolder, "frontend"), { recursive: true });
  await fsp.mkdir(path.join(tmpFolder, "download"), { recursive: true });

  const ml = await MiddleLayerImpl.init(pl, tmpFolder, {
    defaultTreeOptions: { pollingInterval: 250, stopPollingDelay: 500 },
    devBlockUpdateRecheckInterval: 300,
    localSecret: MiddleLayerImpl.generateLocalSecret(),
    localProjections: [], // TODO must be different with local pl
    openFileDialogCallback: () => {
      throw new Error("Not implemented.");
    },
    ...ops,
  });
  ml.addRuntimeCapability("requiresUIAPIVersion", 1);
  ml.addRuntimeCapability("requiresUIAPIVersion", 2);
  ml.addRuntimeCapability("requiresUIAPIVersion", 3);
  registerServiceCapabilities((flag, value) => ml.addRuntimeCapability(flag, value));
  return ml;
}

export const blockTest = plTest.extend<{
  ml: MiddleLayer;
  rawPrj: Project;
  helpers: RawHelpers;
}>({
  ml: async ({ pl, tmpFolder }, use) => {
    const ml = await initTestMiddleLayer(pl, tmpFolder);
    try {
      await use(ml);
    } finally {
      await ml.close();
    }
  },
  rawPrj: async ({ ml }, use) => {
    const prj1Id = await ml.createProject({ label: "Test Project" });
    await ml.openProject(prj1Id);
    const prj = ml.getOpenedProject(prj1Id);
    try {
      await use(prj);
    } finally {
      ml.closeProject(prj1Id);
    }
  },
  helpers: async ({ ml, rawPrj }, use) => {
    await use(createRawHelpers(ml, rawPrj));
  },
});
