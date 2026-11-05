/**
 * The load of the whole Platforma instance, as the Desktop App shows it in its top bar.
 *
 * The backend keeps one instance statistics context per instance, and its executor runner writes
 * the scheduler's readings into it every few seconds. The middle layer reads them; the numbers are
 * what the scheduler has allocated, not measured use.
 */

/** CPU or RAM: what is allocated now, out of the configured capacity when the backend knows it. */
export type InstanceStatsCapacity = {
  /** Configured capacity, undefined when the source does not know it. */
  readonly total?: number;
  /** Allocated now. Can exceed `total`: local CPU can be overcommitted. */
  readonly current: number;
};

/** Why the stats carry no numbers. */
export type InstanceStatsAvailability =
  /** Read from the instance statistics context. */
  | "read"
  /** The backend has no instance statistics context. */
  | "unsupported"
  /** The context exists but could not be read. */
  | "unreadable";

/** One sample of the instance statistics. */
export type InstanceStats = {
  readonly availability: InstanceStatsAvailability;
  /** In millicores. */
  readonly cpu?: InstanceStatsCapacity;
  /** In bytes. */
  readonly ram?: InstanceStatsCapacity;
  /**
   * GPUs. On Kueue, devices held by jobs out of the quota. Locally, jobs that use a GPU on the
   * detected cards; jobs share cards, so `current` can exceed `total`. Undefined when no GPU count
   * is known: a local install without a GPU, or Kubernetes without a GPU pool.
   */
  readonly gpu?: InstanceStatsCapacity;
  /** GPU memory allocated to jobs, in bytes. Set only on a local install with a detected GPU. */
  readonly gpuMemory?: InstanceStatsCapacity;
  /** Jobs holding an allocation, and jobs waiting for one. */
  readonly jobs?: { readonly running: number; readonly queued: number };
  /** Where the numbers come from, `scheduler` or `kueue`. A label only. */
  readonly source?: string;
};

/** Stats for a backend without the instance statistics context. */
export const UnsupportedInstanceStats: InstanceStats = { availability: "unsupported" };
