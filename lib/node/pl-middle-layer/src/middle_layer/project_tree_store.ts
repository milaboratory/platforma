import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtendedResourceData, TreeStateStore } from "@milaboratories/pl-tree";
import type { SignedResourceId } from "@milaboratories/pl-client";
import { resourceIdToString } from "@milaboratories/pl-client";
import type { MiLogger } from "@milaboratories/ts-helpers";

/**
 * ⚠ **The open correctness question on this store.**
 *
 * The intent was to persist only types that are immutable by construction — `BlockPackCustom`
 * above all, which is a published package addressed by content and never rewritten, and which is
 * 63–90 % of the bytes of a cold project open (COLD-OPEN.md §2.2).
 *
 * That does not work. `PlTreeState` requires every resource to be reachable from a root: replaying
 * a lone block pack throws `orphan resource` from `updateFromResourceData`, and — worse — that
 * throw calls `invalidateTree()`, so a rejected hydration leaves the tree permanently unusable
 * rather than merely un-warmed. Measured 2026-08-03.
 *
 * So the store has to persist a connected subgraph, which in practice means the whole tree, which
 * means relying on `ExtendedResourceData.final`. And that flag is `frame.final ||
 * frame.traverseWasStopped` (`pl-tree/sync.ts`) — it conflates genuinely immutable resources with
 * ones where our own stop rules ended traversal. The stop rules are all gated on
 * `readyOrDuplicateOrError()`, so those resources are at least settled, but "settled" is not
 * "immutable" and this store cannot tell the two apart.
 *
 * **This is why the feature is opt-in and unshipped.** It needs a `pl-tree` owner to say either
 * "traverseWasStopped resources are safe to persist" or "split the flag". Until then, leaving it
 * off is the correct default.
 */
const PERSIST_ONLY_TYPES: Set<string> | undefined = undefined;

type StoredFile = {
  /** Bumped whenever the stored shape changes, so old files are ignored rather than misread. */
  version: number;
  /**
   * Roots the tree had when this was written, as full signed ids — signature included.
   *
   * Two reasons it is the signed form and not `resourceIdToString`, which strips signatures:
   * a tree whose roots moved is a different tree, and a backend that re-mints resource
   * signatures makes every stored id unusable. Comparing the signed form turns the second case
   * into a clean cache miss and a full load, instead of hydrating the heap with ids the backend
   * will not accept. (Measured 2026-08-03: signatures were byte-identical across two sessions
   * 12 h apart, so this is a guard rather than an everyday path — but `pl-client` explicitly
   * warns that signatures are session-scoped, so it must not be assumed.)
   */
  roots: string[];
  resources: unknown[];
};

const STORE_VERSION = 1;

/**
 * `ExtendedResourceData` is not plain JSON: resource references are `bigint` and payloads are
 * `Buffer`, and `JSON.stringify` throws on the former and mangles the latter. These two tag
 * both so a round trip is lossless, rather than encoding the fields that happen to be known
 * today and silently corrupting any that get added later.
 */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    const tagged = value as { __bigint?: string; type?: string; data?: unknown };
    if (typeof tagged.__bigint === "string") return BigInt(tagged.__bigint);
    // Buffers serialise as {type:"Buffer",data:[…]} via their own toJSON, so rebuild them.
    if (tagged.type === "Buffer" && Array.isArray(tagged.data))
      return Buffer.from(tagged.data as number[]);
  }
  return value;
}

/**
 * File-backed {@link TreeStateStore} for a single project tree. Read
 * {@link PERSIST_ONLY_TYPES} before enabling it — the correctness argument is not closed.
 */
export function createProjectTreeStore(
  cacheDir: string,
  rid: SignedResourceId,
  logger?: MiLogger,
): TreeStateStore {
  const file = path.join(cacheDir, `${resourceIdToString(rid)}.tree.json`);

  return {
    async load(roots) {
      const raw = await fs.readFile(file, "utf-8").catch(() => undefined);
      if (raw === undefined) return undefined;

      const parsed = JSON.parse(raw, reviver) as StoredFile;
      if (parsed.version !== STORE_VERSION) return undefined;

      // See StoredFile.roots: rejects both a moved root set and re-minted signatures.
      const expected = new Set<string>(roots);
      if (parsed.roots.length !== expected.size || parsed.roots.some((r) => !expected.has(r)))
        return undefined;

      const resources = parsed.resources as ExtendedResourceData[];
      logger?.info(`Project tree store: ${resources.length} resources available from ${file}`);
      return resources;
    },

    async save(resources, roots) {
      const keep = resources.filter(
        (resource) =>
          resource.final && (!PERSIST_ONLY_TYPES || PERSIST_ONLY_TYPES.has(resource.type.name)),
      );
      if (keep.length === 0) return;

      const payload: StoredFile = {
        version: STORE_VERSION,
        roots: [...roots],
        resources: keep,
      };
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(payload, replacer));
    },
  };
}
