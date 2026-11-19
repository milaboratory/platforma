/**
 * The load of the whole Platforma instance, read from the backend's instance statistics context.
 *
 * A backend that advertises `instanceStats:v1` keeps one such context; without it nothing is read.
 * Core creates one context per instance and grants every user read access; the executor runner
 * writes its readings as `reading/instance/<key>` every few seconds, all keys of a sample in one
 * transaction. The middle layer finds the context once, then reads its key-values on the same
 * cadence and publishes a sample only when it changed.
 *
 * Contract: pl `plapi/plapi/instance_stats_context.go` (MILAB-7312).
 */

import type {
  BackendCapability,
  KeyValueString,
  SignedResourceId,
} from "@milaboratories/pl-client";
import type { Computable } from "@milaboratories/computable";
import { Computable as ComputableFactory, WatchableValue } from "@milaboratories/computable";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { InstanceStats, InstanceStatsCapacity } from "@milaboratories/pl-model-middle-layer";
import { UnsupportedInstanceStats } from "@milaboratories/pl-model-middle-layer";
import { setTimeout } from "node:timers/promises";

/** The backend capability that says the instance statistics context exists. */
export const InstanceStatsCapability = "instanceStats:v1";

/** The resource type name of the instance statistics context. */
export const InstanceStatsContextTypeName = "InstanceStatsContext";

/** Prefix of the instance statistics readings. */
const ReadingPrefix = "reading/instance/";

/** How often the readings are read: the writer's default interval. */
const PollIntervalMs = 10_000;

function asCapacity(v: unknown): InstanceStatsCapacity | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const { total, current } = v as { total?: unknown; current?: unknown };
  if (typeof current !== "number") return undefined;
  return typeof total === "number" ? { total, current } : { current };
}

function asJobs(v: unknown): InstanceStats["jobs"] {
  if (typeof v !== "object" || v === null) return undefined;
  const { running, queued } = v as { running?: unknown; queued?: unknown };
  if (typeof running !== "number" || typeof queued !== "number") return undefined;
  return { running, queued };
}

/**
 * The stats from the context's key-values. A reading that is missing or not the expected JSON is
 * left out rather than failing the sample: the readings are diagnostic, and a newer writer may add
 * or reshape keys.
 */
export function parseInstanceStats(kvs: readonly { key: string; value: string }[]): InstanceStats {
  const readings = new Map<string, unknown>();
  for (const { key, value } of kvs) {
    if (!key.startsWith(ReadingPrefix)) continue;
    try {
      readings.set(key.slice(ReadingPrefix.length), JSON.parse(value));
    } catch {
      // not JSON: left out
    }
  }

  const source = readings.get("source");
  return {
    status: "ok",
    cpu: asCapacity(readings.get("cpu")),
    ram: asCapacity(readings.get("ram")),
    gpu: asCapacity(readings.get("gpu")),
    gpuMemory: asCapacity(readings.get("gpu-memory")),
    jobs: asJobs(readings.get("jobs")),
    source: typeof source === "string" ? source : undefined,
  };
}

/**
 * The part of a client the watch uses: a `PlClient` satisfies it, and a test can serve it without a
 * backend.
 */
export interface InstanceStatsClient {
  hasCapability(capability: BackendCapability): boolean;
  listSharedResourcesByType(resourceTypeName: string): Promise<SignedResourceId[]>;
  withReadTx<T>(
    name: string,
    body: (tx: {
      listKeyValuesString(rId: SignedResourceId): Promise<KeyValueString[]>;
    }) => Promise<T>,
  ): Promise<T>;
}

/**
 * Reads the instance statistics while the middle layer lives.
 *
 * Reports `unsupported` without `instanceStats:v1`, and while the context cannot be found. A
 * context whose writer is off yields a sample without readings.
 */
export class InstanceStatsWatch {
  private readonly value = new WatchableValue<InstanceStats | undefined>(undefined);
  private readonly abortController = new AbortController();
  private readonly loop: Promise<void>;

  /** The latest sample; undefined until the first read. */
  public readonly stats: Computable<InstanceStats | undefined>;

  constructor(
    private readonly pl: InstanceStatsClient,
    private readonly logger: MiLogger,
  ) {
    this.stats = ComputableFactory.make((ctx) => this.value.getValue(ctx));
    this.loop = this.run();
    this.loop.catch((err: unknown) =>
      this.logger.warn(new Error("instance stats loop failed", { cause: err })),
    );
  }

  public async terminate(): Promise<void> {
    this.abortController.abort();
    try {
      await this.loop;
    } catch {
      // logged where it was raised
    }
    this.stats.resetState();
  }

  /** The last published sample, serialized, to skip publishing one that did not change. */
  private lastPublished?: string;

  private publish(stats: InstanceStats): void {
    const serialized = JSON.stringify(stats);
    if (serialized === this.lastPublished) return;
    this.lastPublished = serialized;
    this.value.setValue(stats, "instance stats changed");
  }

  private async run(): Promise<void> {
    // A backend that does not advertise the context has none to find: nothing is listed or read.
    if (!this.pl.hasCapability(InstanceStatsCapability)) {
      this.publish(UnsupportedInstanceStats);
      return;
    }

    let context: SignedResourceId | undefined;
    while (!this.abortController.signal.aborted) {
      try {
        context ??= (await this.pl.listSharedResourcesByType(InstanceStatsContextTypeName))[0];
        if (context === undefined) this.publish(UnsupportedInstanceStats);
        else {
          const ref = context;
          const kvs = await this.pl.withReadTx("instanceStats", (tx) =>
            tx.listKeyValuesString(ref),
          );
          this.publish(parseInstanceStats(kvs));
        }
      } catch (err: unknown) {
        if (this.abortController.signal.aborted) return;
        // Retried on the next tick, with the context looked up again in case it was replaced.
        this.logger.warn(new Error("instance stats read failed", { cause: err }));
        context = undefined;
        this.publish({ status: "unreadable" });
      }

      try {
        await setTimeout(PollIntervalMs, undefined, { signal: this.abortController.signal });
      } catch {
        return; // aborted
      }
    }
  }
}
