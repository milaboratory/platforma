import type { PersistedTree, PersistedTreeReadFailure } from "@milaboratories/pl-tree";
import {
  decodePersistedTree,
  encodePersistedTree,
  PERSISTED_TREE_SCHEMA_VERSION,
  readPersistedTreeHeader,
} from "@milaboratories/pl-tree";
import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import { parseSignedResourceId } from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { createPathAtomically, ensureDirExists } from "@milaboratories/ts-helpers";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { ML_BUILD_STAMP } from "./build_stamp";

/** Why a read did not produce a tree to restore from. Counted rather than inferred, because
 *  "no snapshot" and "a snapshot we refused" are very different things when a warm reopen
 *  fails to be warm and someone has to work out why. */
export type TreeSnapshotMiss =
  /** No file for this key: a first open, or the key moved (new build, new backend, new user). */
  | "absent"
  /** A file is there but could not be opened at all: permissions, a bad mount, an I/O error.
   *  Distinct from `absent` because a first open and a broken cache directory need different
   *  answers from whoever reads the counters. */
  | "unreadable"
  /** File exists, but its signatures belong to a session that has ended. Kept, not deleted. */
  | "session-rotated"
  /** File exists and could not be read. Carries the codec's reason. */
  | PersistedTreeReadFailure;

export type TreeSnapshotStat = {
  reads: number;
  /** Snapshots read successfully. A hit is not yet a warm open: the tree can still refuse to
   *  apply it, which is what {@link restores} counts. */
  hits: number;
  /** Snapshots actually applied as a tree's initial state. This is the number that says a
   *  reopen was warm. */
  restores: number;
  /** Miss counts by reason. */
  misses: Record<TreeSnapshotMiss, number>;
  writes: number;
  writeFailures: number;
  bytesWritten: number;
  /** Snapshots deleted by the fail-safe after a restored tree failed its first refresh. */
  discarded: number;
  /** Files removed at startup, and how many of those were dropped for being over the ceiling
   *  rather than for belonging to another build, backend or user. */
  evicted: number;
  evictedForSize: number;
  bytesEvicted: number;
  millisReading: number;
  millisWriting: number;
};

function initialStat(): TreeSnapshotStat {
  return {
    reads: 0,
    hits: 0,
    restores: 0,
    misses: {
      absent: 0,
      unreadable: 0,
      "session-rotated": 0,
      "not-a-snapshot": 0,
      "unknown-schema": 0,
      truncated: 0,
      checksum: 0,
      malformed: 0,
    },
    writes: 0,
    writeFailures: 0,
    bytesWritten: 0,
    discarded: 0,
    evicted: 0,
    evictedForSize: 0,
    bytesEvicted: 0,
    millisReading: 0,
    millisWriting: 0,
  };
}

export type TreeSnapshotStoreOps = {
  /** Directory holding the snapshots. One file per project. */
  readonly dir: string;
  /** Total bytes the directory may occupy after startup eviction. */
  readonly maxSizeBytes: number;
  readonly logger: MiLogger;
};

const FILE_PREFIX = "tree.";
const FILE_SUFFIX = ".plts";

/** Keeps a filename to characters every filesystem we target accepts. */
function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Names this class writes: a finished snapshot, or the staging file of a write killed before
 *  its rename. The directory is caller-supplied and only defaults to one of ours, so nothing
 *  failing this is ever deleted, by the purge or by the startup eviction. */
function isOurFile(name: string): boolean {
  if (!name.startsWith(FILE_PREFIX)) return false;
  return name.endsWith(FILE_SUFFIX) || name.includes(`${FILE_SUFFIX}.tmp.`);
}

/**
 * Snapshots of project tree mirrors on the local filesystem.
 *
 * A snapshot is addressed by backend instance, authenticated user, root resource, build stamp
 * and snapshot schema version. Everything except the root goes into the *scope*, which is
 * fixed for the lifetime of a client; the root distinguishes one project from another, so
 * there is one file per project per user per backend, rewritten in place.
 *
 * The session is deliberately not part of the key. It is witnessed inside the file and
 * compared on read: a snapshot from an ended session is a miss, but the file is kept, because
 * its bodies remain valid indefinitely and only its signatures have died. Deleting it would
 * destroy the evidence a future signature refresh would repair.
 */
export class TreeSnapshotStore {
  private readonly stat = initialStat();

  private constructor(
    private readonly ops: TreeSnapshotStoreOps,
    /** Identifies backend, user, build and schema. Same for every project in this session. */
    private readonly scope: string,
  ) {}

  /**
   * Builds a store for the given client, or returns undefined when nothing should be
   * persisted for it.
   *
   * Returns undefined for an impersonated client: reading and writing under `asUser` would
   * leave another user's mirror at rest under the admin's identity, usable only if the admin
   * returned to that exact root. One condition removes both the hygiene question and the
   * orphan one.
   */
  public static create(
    pl: PlClient,
    ops: TreeSnapshotStoreOps & { readonly enabled: boolean },
  ): TreeSnapshotStore | undefined {
    if (!ops.enabled) {
      ops.logger.info("tree snapshots are disabled by configuration");
      return undefined;
    }
    if (pl.conf.asUser !== undefined) {
      ops.logger.info("tree snapshots are disabled while the client is opened as another user");
      return undefined;
    }

    // The backend *instance*, not merely its address: instanceId rotates whenever the backend
    // resets its database, which is exactly the case where the same address starts serving a
    // different state under reused global ids. Without it, a reset at a fixed address (a local
    // backend, whose working directory does not move) would be a key hit, and the only thing
    // left to catch it would be the witness, which is empty on both sides on a backend that
    // predates resource signatures.
    //
    // Hashed rather than spelled out: a login can be an email and an address can carry
    // characters a filename cannot. The hash only has to be stable and to differ when any part
    // differs, both of which it does. The NUL separator keeps the parts unambiguous.
    const identity = createHash("sha256")
      .update([pl.conf.hostAndPort, pl.serverInfo.instanceId ?? "", pl.authUser ?? ""].join("\0"))
      .digest("hex")
      .slice(0, 16);

    const scope = `${PERSISTED_TREE_SCHEMA_VERSION}.${safe(ML_BUILD_STAMP)}.${identity}`;
    return new TreeSnapshotStore(ops, scope);
  }

  /**
   * Removes this class's files from the snapshot directory. Run when snapshots are switched
   * off, so a user who turns the kill switch off because the disk is full or unwritable
   * actually gets the space back, rather than leaving up to the size ceiling stranded there
   * indefinitely.
   *
   * Deliberately keyed on the setting rather than on "there is no store": a store is also
   * absent for an impersonated client, and deleting there would destroy the operator's own
   * snapshots from their ordinary sessions. Never throws.
   */
  public static async purge(dir: string, logger: MiLogger): Promise<void> {
    try {
      // Deliberately NOT a recursive delete of `dir`. The path is caller-supplied and only
      // defaults to a directory of ours, so removing it wholesale would let a misconfigured
      // `treeSnapshotPath` take an unrelated directory with it, at the exact moment the user
      // reached for a switch labelled "my disk is troublesome". Only files this class writes
      // are removed, then the directory itself if that emptied it.
      for (const name of await fsp.readdir(dir)) {
        if (!isOurFile(name)) continue;
        await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
      }
      await fsp.rmdir(dir).catch(() => {
        // Still holds something that is not ours; leaving it is the point.
      });
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException | null)?.code === "ENOENT") return;
      logger.warn(
        `failed to clear the tree snapshot directory: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  public getStats(): Readonly<TreeSnapshotStat> {
    return this.stat;
  }

  private fileFor(root: SignedResourceId): string {
    // The root's global id, not the signed form: the signature changes every session while
    // the file must not.
    const { globalId } = parseSignedResourceId(root);
    return path.join(this.ops.dir, `${FILE_PREFIX}${this.scope}.${globalId}${FILE_SUFFIX}`);
  }

  /**
   * Reads the snapshot for a project root, or reports why there is nothing to restore.
   *
   * `root` is the id as resolved in the current session. Its signature is what the stored
   * witness is compared against, so a rotated session is detected without inflating the
   * payload, and no separate session lookup is needed anywhere.
   */
  public async read(
    root: SignedResourceId,
  ): Promise<{ ok: true; tree: PersistedTree } | { ok: false; miss: TreeSnapshotMiss }> {
    const started = Date.now();
    this.stat.reads++;
    try {
      const file = this.fileFor(root);
      let bytes: Buffer;
      try {
        bytes = await fsp.readFile(file);
      } catch (e: unknown) {
        // A missing file and an unreadable one both mean a cold open, but they are different
        // problems: one is an ordinary first open, the other is a cache directory that needs
        // attention, and the counters are the only place that difference is visible.
        const absent = (e as NodeJS.ErrnoException | null)?.code === "ENOENT";
        if (!absent)
          this.ops.logger.warn(
            `tree snapshot exists but could not be read: ${e instanceof Error ? e.message : String(e)}`,
          );
        return this.miss(absent ? "absent" : "unreadable");
      }

      const header = readPersistedTreeHeader(bytes);
      if (!header.ok) return this.miss(header.reason);

      // On a backend predating resource signatures both sides are empty and always match,
      // which is right: without signatures the ids are not session-bound in the first place.
      const { signature } = parseSignedResourceId(root);
      if (!Buffer.from(header.value.witness).equals(Buffer.from(signature)))
        // Kept, not deleted. See the class comment.
        return this.miss("session-rotated");

      const decoded = await decodePersistedTree(bytes);
      if (!decoded.ok) return this.miss(decoded.reason);

      // Touched on a hit so the modification time tracks last *use*, which is what the size
      // trim is supposed to order by. Without this, a project reopened every day but never
      // changed is never rewritten, and so ages out ahead of one touched once and abandoned.
      const now = new Date();
      await fsp.utimes(file, now, now).catch(() => {
        // Ordering the trim is not worth failing a hit over.
      });

      this.stat.hits++;
      return { ok: true, tree: decoded.value };
    } finally {
      this.stat.millisReading += Date.now() - started;
    }
  }

  private miss(miss: TreeSnapshotMiss): { ok: false; miss: TreeSnapshotMiss } {
    this.stat.misses[miss]++;
    return { ok: false, miss };
  }

  /** Recorded by the caller once it knows the tree accepted the snapshot. The store cannot
   *  tell on its own: it hands over bytes, and whether they become a tree is the tree's call. */
  public noteRestored(): void {
    this.stat.restores++;
  }

  /**
   * Writes a snapshot, replacing any previous one for the same project.
   *
   * Never throws and never rejects: a write is an optimisation, and a full disk or a
   * permissions problem must not fail the operation that triggered it. Staged and renamed
   * into place, so a process killed mid-write leaves the previous snapshot rather than a torn
   * one.
   */
  public async write(
    root: SignedResourceId,
    snapshot: PersistedTree,
    ops: { compress?: boolean } = {},
  ): Promise<boolean> {
    const started = Date.now();
    try {
      const bytes = await encodePersistedTree(snapshot, { compress: ops.compress });
      await ensureDirExists(this.ops.dir);

      const file = this.fileFor(root);
      await createPathAtomically(this.ops.logger, file, async (tempPath) => {
        // "wx" so a colliding temp name fails instead of overwriting another writer's file.
        await fsp.writeFile(tempPath, bytes, { flag: "wx" });
      });

      this.stat.writes++;
      this.stat.bytesWritten += bytes.length;
      return true;
    } catch (e: unknown) {
      this.stat.writeFailures++;
      this.ops.logger.warn(
        `failed to write tree snapshot: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    } finally {
      this.stat.millisWriting += Date.now() - started;
    }
  }

  /** Deletes the snapshot for a project. Used by the fail-safe, when a restored tree turns
   *  out not to match what the backend will serve. Never throws. */
  public async discard(root: SignedResourceId): Promise<void> {
    try {
      await fsp.rm(this.fileFor(root), { force: true });
      this.stat.discarded++;
    } catch (e: unknown) {
      this.ops.logger.warn(
        `failed to discard tree snapshot: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Startup housekeeping. Drops every snapshot outside the current scope (another build,
   * backend, user or schema version), then trims what is left to the size ceiling, least
   * recently written first.
   *
   * Modification time stands in for recency of use: an open project is rewritten
   * periodically, so the file's age tracks how recently the project was worked on. Read times
   * would be a truer signal but atime is unreliable across platforms and mount options.
   *
   * Runs at startup only, so the ceiling bounds what a session starts with rather than capping
   * it throughout: a long session opening many projects can exceed it until the next launch.
   *
   * Never throws: an unusable cache directory should cost the cache, not the startup.
   */
  public async evict(): Promise<void> {
    try {
      await ensureDirExists(this.ops.dir);
      const names = await fsp.readdir(this.ops.dir);

      const current: { file: string; size: number; mtimeMs: number }[] = [];

      for (const name of names) {
        const file = path.join(this.ops.dir, name);

        // Anything of ours not addressed to the current scope goes: another build, backend,
        // user or schema version, and also the staging files of a write that was killed
        // before its rename, which end in `.tmp.<hex>` rather than the suffix.
        const inScope =
          name.startsWith(`${FILE_PREFIX}${this.scope}.`) && name.endsWith(FILE_SUFFIX);

        // Out of scope is not the same as ours to delete: a `treeSnapshotPath` pointed at an
        // existing or shared directory would otherwise have every file in it removed at
        // startup. Same rule as `purge`, for the same reason.
        if (!inScope && !isOurFile(name)) continue;

        let size = 0;
        let mtimeMs = 0;
        try {
          const stat = await fsp.stat(file);
          if (!stat.isFile()) continue;
          size = stat.size;
          mtimeMs = stat.mtimeMs;
        } catch {
          continue; // vanished under us, or unreadable: nothing to account for
        }

        if (inScope) {
          current.push({ file, size, mtimeMs });
          continue;
        }

        await this.remove(file, size, false);
      }

      const ceiling = this.ops.maxSizeBytes;
      let total = current.reduce((sum, e) => sum + e.size, 0);
      if (total <= ceiling) return;

      // Oldest first, so the projects a user is actually working on are the ones that survive.
      current.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const entry of current) {
        if (total <= ceiling) break;
        // Only a file that actually went stops counting against the ceiling. Subtracting
        // regardless would let one undeletable file end the trim early and leave the directory
        // over its limit.
        if (await this.remove(entry.file, entry.size, true)) total -= entry.size;
      }
    } catch (e: unknown) {
      this.ops.logger.warn(
        `tree snapshot eviction failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async remove(file: string, size: number, forSize: boolean): Promise<boolean> {
    try {
      await fsp.rm(file, { force: true });
      this.stat.evicted++;
      this.stat.bytesEvicted += size;
      if (forSize) this.stat.evictedForSize++;
      return true;
    } catch {
      // A file we cannot delete is not worth failing startup over; it will be reconsidered
      // on the next one.
      return false;
    }
  }
}
