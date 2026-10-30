/**
 * The load of the whole Platforma instance, read from the backend's instance statistics context.
 *
 * Core creates one context per instance and grants every user read access; the executor runner
 * writes its readings as `reading/instance/<key>` every few seconds, all keys of a sample in one
 * transaction. The middle layer finds the context once, then reads its key-values on the same
 * cadence and publishes a sample only when it changed.
 *
 * Contract: pl `plapi/plapi/instance_stats_context.go` (MILAB-7312).
 */

import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import type { Computable } from "@milaboratories/computable";
import { Computable as ComputableFactory, WatchableValue } from "@milaboratories/computable";
import type { MiLogger } from "@milaboratories/ts-helpers";
import type { InstanceStats, InstanceStatsCapacity } from "@milaboratories/pl-model-middle-layer";
import { UnsupportedInstanceStats } from "@milaboratories/pl-model-middle-layer";
import { setTimeout } from "node:timers/promises";

/** The resource type name of the instance statistics context. */
export const InstanceStatsContextTypeName = "InstanceStatsContext";

/** Prefix of the instance statistics readings. */
const ReadingPrefix = "reading/instance/";

/** How often the readings are read: the writer's default interval. */
const PollIntervalMs = 10_000;

/** How many polls pass before a backend without the context is asked again. */
const RediscoverEveryPolls = 30;

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
  const kueueShared = readings.get("kueue-shared");
  return {
    availability: "read",
    cpu: asCapacity(readings.get("cpu")),
    ram: asCapacity(readings.get("ram")),
    jobs: asJobs(readings.get("jobs")),
    source: typeof source === "string" ? source : undefined,
    kueueShared: typeof kueueShared === "boolean" ? kueueShared : undefined,
  };
}

/** Reads the instance statistics while the middle layer lives. */
export class InstanceStatsWatch {
  private readonly value = new WatchableValue<InstanceStats | undefined>(undefined);
  private readonly abortController = new AbortController();
  private readonly loop: Promise<void>;

  /** The latest sample; undefined until the first read. */
  public readonly stats: Computable<InstanceStats | undefined>;

  constructor(
    private readonly pl: PlClient,
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
    let context: SignedResourceId | undefined;
    let pollsSinceDiscovery = RediscoverEveryPolls;

    while (!this.abortController.signal.aborted) {
      try {
        if (context === undefined && pollsSinceDiscovery >= RediscoverEveryPolls) {
          pollsSinceDiscovery = 0;
          const found = await this.pl.listSharedResourcesByType(InstanceStatsContextTypeName);
          context = found[0];
          if (context === undefined) this.publish(UnsupportedInstanceStats);
        }
        if (context !== undefined) {
          const ref = context;
          const kvs = await this.pl.withReadTx("instanceStats", (tx) =>
            tx.listKeyValuesString(ref),
          );
          this.publish(parseInstanceStats(kvs));
        }
      } catch (err: unknown) {
        if (this.abortController.signal.aborted) return;
        // A listing the backend does not implement means no context to find; anything else is
        // retried on the next tick, and the context looked up again in case it was replaced.
        this.logger.warn(new Error("instance stats read failed", { cause: err }));
        context = undefined;
        pollsSinceDiscovery = RediscoverEveryPolls;
        this.publish({ availability: "unreadable" });
      }

      pollsSinceDiscovery++;
      try {
        await setTimeout(PollIntervalMs, undefined, { signal: this.abortController.signal });
      } catch {
        return; // aborted
      }
    }
  }
}
