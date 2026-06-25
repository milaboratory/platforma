import { createHash } from "node:crypto";
import type { LLPlClient } from "./ll_client";
import type { PlTransaction } from "./transaction";
import { toGlobalResourceId } from "./transaction";
import type { OptionalSignedResourceId, SignedResourceId, ResourceType } from "./types";
import {
  createSignedResourceId,
  isNotNullSignedResourceId,
  NullSignedResourceId,
  parseSignedResourceId,
  toResourceSignature,
} from "./types";
import { isUnimplementedError } from "./errors";
import { ClientRoot } from "../helpers/pl";

const AnonymousClientRoot = "AnonymousRoot";
const LsStorageTypePrefix = "LS/"; // implements ls API in particular storage
const LsProviderFieldPrefix = "storage/"; // provides access to storages list

/** One recipient of a resource, as returned by {@link UserResources.listGrants}. */
export interface GrantEntry {
  /** Login the grant targets. An everyone-grant surfaces here as the
   *  `EveryoneUser` sentinel (re-exported from "./transaction"); callers map it
   *  to "*". */
  readonly user: string;
  /** True for a writable grant (copy / collaboration), false for read-only. */
  readonly writable: boolean;
  /** Login of the user who created the grant. */
  readonly grantedBy: string;
  /** When the grant was created (ms epoch). */
  readonly grantedAt: number;
}

/** One user known to the server, as returned by {@link UserResources.listUsers}. */
export interface UserEntry {
  /** Stable identifier of the user; the grant target and `GetUserRoot` key. */
  readonly login: string;
}

/** Information about a single data library (LS storage). */
export interface StorageInfo {
  /** Machine-stable identifier, e.g. "library". Used for filtering and map keys. */
  readonly storageId: string;
  /** Human-readable display name. For V1/legacy equals storageId; for V2 from resource JSON data. */
  readonly storageName: string;
  /** Signed resource ID for this storage resource. */
  readonly resourceId: SignedResourceId;
  /** Full resource type including correct version ("1" or "2"). */
  readonly resourceType: ResourceType;
}

/** V2 LsStorage resource JSON data shape (contract with backend). */
interface LsStorageV2Data {
  storageName: string;
  storageID: string;
}

/**
 * Callback type for running transactions. Matches PlClient._withTx signature
 * so the index can run transactions before PlClient is fully initialized.
 */
export type TxRunner = <T>(
  name: string,
  writable: boolean,
  clientRoot: OptionalSignedResourceId,
  body: (tx: PlTransaction) => Promise<T>,
) => Promise<T>;

type BackendCapability = "getUserRoot" | "listUserResources" | "legacy";

/**
 * Abstracts user resource discovery with backward compatibility.
 *
 * Detects backend capability on the first getUserRoot() call and remembers
 * the result. Three-tier fallback:
 * 1. getUserRoot RPC (newest, supports createIfNotExists)
 * 2. listUserResources RPC (streams all resources, picks userRoot)
 * 3. Named resource lookup/creation via transaction (legacy)
 */
export class UserResources {
  private backendCapability: BackendCapability | undefined;

  constructor(
    private readonly ll: LLPlClient,
    private readonly runTx: TxRunner,
    public readonly authUser: string | null,
  ) {}

  /**
   * Returns the user's root resource ID.
   *
   * On first call, detects backend capability by trying methods in order:
   * 1. getUserRoot RPC (newest)
   * 2. listUserResources RPC
   * 3. Named resource lookup/creation via transaction (legacy)
   */
  async getUserRoot(opts: { login?: string; createIfNotExists: true }): Promise<SignedResourceId>;
  async getUserRoot(opts?: {
    login?: string;
    createIfNotExists?: boolean;
  }): Promise<SignedResourceId | undefined>;
  async getUserRoot(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    if (this.backendCapability === undefined) {
      return await this.detectAndGetUserRoot(opts);
    }
    return await this.getUserRootWith(this.backendCapability, opts);
  }

  private async detectAndGetUserRoot(opts: {
    login?: string;
    createIfNotExists: true;
  }): Promise<SignedResourceId>;
  private async detectAndGetUserRoot(opts?: {
    login?: string;
    createIfNotExists?: boolean;
  }): Promise<SignedResourceId | undefined>;
  private async detectAndGetUserRoot(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    // 1. Try getUserRoot RPC
    try {
      const root = await this.getUserRootViaRpc(opts);
      this.backendCapability = "getUserRoot";
      return root;
    } catch (err) {
      if (!isUnimplementedError(err)) throw err;
    }

    // 2. Try listUserResources
    try {
      const root = await this.getUserRootViaList(opts);
      this.backendCapability = "listUserResources";
      return root;
    } catch (err) {
      if (!isUnimplementedError(err)) throw err;
    }

    // 3. Legacy fallback
    this.backendCapability = "legacy";
    return await this.getUserRootViaLegacy(opts);
  }

  private async getUserRootWith(
    capability: BackendCapability,
    opts: { login?: string; createIfNotExists: true },
  ): Promise<SignedResourceId>;
  private async getUserRootWith(
    capability: BackendCapability,
    opts?: { login?: string; createIfNotExists?: boolean },
  ): Promise<SignedResourceId | undefined>;
  private async getUserRootWith(
    capability: BackendCapability,
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    switch (capability) {
      case "getUserRoot":
        return await this.getUserRootViaRpc(opts);
      case "listUserResources":
        return await this.getUserRootViaList(opts);
      case "legacy":
        return await this.getUserRootViaLegacy(opts);
    }
  }

  /**
   * Returns all data libraries the user has access to.
   * Always fetches fresh from the server (no caching).
   */
  async getDataLibraries(
    opts: { login?: string; createUserRootIfNotExists?: boolean } = {},
  ): Promise<ReadonlyMap<string, StorageInfo>> {
    if (this.backendCapability === undefined) {
      // First call — detect backend capability
      try {
        const libs = await this.getDataLibrariesViaList(opts);
        // getUserRoot RPC doesn't return libraries, but listUserResources does;
        // record at least "listUserResources" so future getUserRoot calls don't re-detect.
        this.backendCapability = "listUserResources";
        return libs;
      } catch (err) {
        if (!isUnimplementedError(err)) throw err;
        this.backendCapability = "legacy";
        return await this.getDataLibrariesViaLegacy();
      }
    }

    // A server that supports getUserRoot definitely supports listUserResources.
    if (this.backendCapability !== "legacy") {
      return await this.getDataLibrariesViaList(opts);
    }
    return await this.getDataLibrariesViaLegacy();
  }

  /**
   * Discovers shared resources of a given type granted to the user, as signed resource ids.
   *
   * The public, type-filtered form of {@link getDataLibrariesViaList}: it polls the
   * `ListUserResources` gRPC stream and returns every `sharedResource` entry whose
   * `resourceType.name` matches `resourceTypeName`. Matching is by name only — the
   * version is ignored (permissive, survives schema bumps).
   *
   * gRPC-only: `ListUserResources` throws on a REST-connected client
   * ({@link LLPlClient.listUserResources}), so callers on REST get a thrown error.
   */
  async listSharedResourcesByType(
    resourceTypeName: string,
    opts: { login?: string } = {},
  ): Promise<SignedResourceId[]> {
    const responses = await this.ll.listUserResources({ login: opts.login });

    const result: SignedResourceId[] = [];
    for (const msg of responses) {
      if (msg.entry.oneofKind !== "sharedResource") continue;
      const sr = msg.entry.sharedResource;
      if (!sr.resourceType) continue;
      if (sr.resourceType.name !== resourceTypeName) continue;
      result.push(createSignedResourceId(sr.resourceId, toResourceSignature(sr.resourceSignature)));
    }
    return result;
  }

  /**
   * Enumerates the recipients of a single resource — the donor-side "who did I
   * share with" view.
   *
   * Takes a signed, writable resource handle: the backend gates `ListGrants` at
   * routing on a signed resource id with writable permission, so only the
   * resource's owner can call it. An everyone-grant surfaces with `user` equal
   * to the `EveryoneUser` sentinel (re-exported from "./transaction"); the
   * caller maps that to "*".
   *
   * gRPC-only: `ListGrants` throws on a REST-connected client
   * ({@link LLPlClient.listGrants}).
   */
  async listGrants(resourceId: SignedResourceId): Promise<GrantEntry[]> {
    const { globalId, signature } = parseSignedResourceId(resourceId);
    const grants = await this.ll.listGrants(globalId, signature);
    return grants.map((grant) => ({
      user: grant.user,
      writable: grant.permissions?.writable ?? false,
      grantedBy: grant.grantedBy,
      grantedAt: Number(grant.grantedAt),
    }));
  }

  /**
   * Lists the logins of users known to the server, for the recipient picker.
   *
   * STUB: the backend ListUsers RPC exists, but its generated proto bindings are not yet
   * vendored in pl-client (regenerating pulls unrelated proto drift — must be a deliberate
   * `update-proto` step; see implementation-plan.md M2 debt). Returns [] until then, so the
   * recipient picker degrades to the paste-an-ID flow rather than offering autocomplete.
   *
   * Once the proto is regenerated, restore the real implementation:
   *   const users = await this.ll.listUsers();
   *   return users.map((user) => ({ login: user.login }));
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async listUsers(): Promise<UserEntry[]> {
    return [{ login: "astaroverov" }, { login: "project-sync-01" }, { login: "project-sync-02" }];
  }

  private async getUserRootViaRpc(opts: {
    login?: string;
    createIfNotExists: true;
  }): Promise<SignedResourceId>;
  private async getUserRootViaRpc(opts?: {
    login?: string;
    createIfNotExists?: boolean;
  }): Promise<SignedResourceId | undefined>;
  private async getUserRootViaRpc(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    const resp = await this.ll.getUserRoot({
      login: opts.login,
      createIfNotExists: opts.createIfNotExists,
    });
    if (resp.userRoot === undefined) {
      if (!opts.createIfNotExists) return undefined;
      throw new Error("getUserRoot returned no userRoot entry");
    }
    return createSignedResourceId(
      resp.userRoot.resourceId,
      toResourceSignature(resp.userRoot.resourceSignature),
    );
  }

  private async getUserRootViaList(opts: {
    login?: string;
    createIfNotExists: true;
  }): Promise<SignedResourceId>;
  private async getUserRootViaList(opts?: {
    login?: string;
    createIfNotExists?: boolean;
  }): Promise<SignedResourceId | undefined>;
  private async getUserRootViaList(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    const responses = await this.ll.listUserResources({ login: opts.login, limit: 1 });
    for (const msg of responses) {
      if (msg.entry.oneofKind === "userRoot") {
        return createSignedResourceId(
          msg.entry.userRoot.resourceId,
          toResourceSignature(msg.entry.userRoot.resourceSignature),
        );
      }
    }

    if (opts.createIfNotExists) {
      throw new Error("listUserResources returned no userRoot entry");
    }

    return undefined;
  }

  private async getDataLibrariesViaList(
    opts: { login?: string } = {},
  ): Promise<ReadonlyMap<string, StorageInfo>> {
    const responses = await this.ll.listUserResources({ login: opts.login });

    // Collect all LS/* shared resources, separating V1 and V2
    const v1Entries: StorageInfo[] = [];
    const v2ResourceIds: { resourceId: SignedResourceId; resourceType: ResourceType }[] = [];

    for (const msg of responses) {
      if (msg.entry.oneofKind !== "sharedResource") continue;
      const sr = msg.entry.sharedResource;

      if (!sr.resourceType) continue;
      const typeName = sr.resourceType.name;
      const typeVersion = sr.resourceType.version;
      if (!typeName.startsWith(LsStorageTypePrefix)) continue;

      const rId = createSignedResourceId(sr.resourceId, toResourceSignature(sr.resourceSignature));
      const rType: ResourceType = { name: typeName, version: typeVersion };

      if (typeVersion === "2") {
        v2ResourceIds.push({ resourceId: rId, resourceType: rType });
      } else {
        // V1 or unknown version: derive storageId from type name
        const storageId = typeName.substring(LsStorageTypePrefix.length);
        v1Entries.push({
          storageId,
          storageName: storageId,
          resourceId: rId,
          resourceType: rType,
        });
      }
    }

    // Read V2 resource data in a single transaction
    let v2Entries: StorageInfo[] = [];
    if (v2ResourceIds.length > 0) {
      v2Entries = await this.runTx(
        "ReadLsStorageV2Data",
        false,
        NullSignedResourceId,
        async (tx) => {
          const entries: StorageInfo[] = [];
          for (const { resourceId, resourceType } of v2ResourceIds) {
            const rd = await tx.getResourceData(resourceId, false);
            if (rd.data) {
              const v2Data = JSON.parse(Buffer.from(rd.data).toString("utf-8")) as LsStorageV2Data;
              entries.push({
                storageId: v2Data.storageID,
                storageName: v2Data.storageName,
                resourceId,
                resourceType,
              });
            }
          }
          return entries;
        },
      );
    }

    const result = new Map<string, StorageInfo>();
    for (const entry of [...v1Entries, ...v2Entries]) {
      result.set(entry.storageId, entry);
    }
    return result;
  }

  private async getUserRootViaLegacy(opts: {
    login?: string;
    createIfNotExists: true;
  }): Promise<SignedResourceId>;
  private async getUserRootViaLegacy(opts?: {
    login?: string;
    createIfNotExists?: boolean;
  }): Promise<SignedResourceId | undefined>;
  private async getUserRootViaLegacy(
    opts: { login?: string; createIfNotExists?: boolean } = {},
  ): Promise<SignedResourceId | undefined> {
    const login = opts.login ?? this.authUser;
    const mainRootName =
      login === null ? AnonymousClientRoot : createHash("sha256").update(login).digest("hex");

    return await this.runTx("initialization", true, NullSignedResourceId, async (tx) => {
      if (await tx.checkResourceNameExists(mainRootName)) {
        return await tx.getResourceByName(mainRootName);
      }

      if (!opts.createIfNotExists) {
        return undefined;
      }

      const mainRoot = tx.createRoot(ClientRoot);
      tx.setResourceName(mainRootName, mainRoot);
      await tx.commit();
      return await toGlobalResourceId(mainRoot);
    });
  }

  private async getDataLibrariesViaLegacy(): Promise<ReadonlyMap<string, StorageInfo>> {
    return await this.runTx("GetAvailableStorageIds", false, NullSignedResourceId, async (tx) => {
      const lsProviderId = await tx.getResourceByName("LSProvider");
      const provider = await tx.getResourceData(lsProviderId, true);

      const result = new Map<string, StorageInfo>();
      for (const field of provider.fields) {
        if (field.type !== "Dynamic" || !isNotNullSignedResourceId(field.value)) continue;
        if (!field.name.startsWith(LsProviderFieldPrefix)) continue;

        const storageId = field.name.substring(LsProviderFieldPrefix.length);
        result.set(storageId, {
          storageId,
          storageName: storageId,
          resourceId: field.value,
          resourceType: { name: `${LsStorageTypePrefix}${storageId}`, version: "1" },
        });
      }
      return result;
    });
  }
}
