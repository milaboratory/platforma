import { createHash } from "node:crypto";
import type { LLPlClient } from "./ll_client";
import type { PlTransaction } from "./transaction";
import { toGlobalResourceId } from "./transaction";
import type { OptionalResourceId, ResourceId, ResourceType } from "./types";
import {
  bigintToResourceId,
  isNotNullResourceId,
  NullResourceId,
  toResourceSignature,
} from "./types";
import { isUnimplementedError } from "./errors";
import { ClientRoot } from "../helpers/pl";

const AnonymousClientRoot = "AnonymousRoot";
const LsStorageTypePrefix = "LS/"; // implements ls API in particular storage
const LsProviderFieldPrefix = "storage/"; // provides access to storages list

/** Information about a single data library (LS storage). */
export interface StorageInfo {
  /** Machine-stable identifier, e.g. "library". Used for filtering and map keys. */
  readonly storageId: string;
  /** Human-readable display name. For V1/legacy equals storageId; for V2 from resource JSON data. */
  readonly storageName: string;
  /** Signed resource ID for this storage resource. */
  readonly resourceId: ResourceId;
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
  clientRoot: OptionalResourceId,
  body: (tx: PlTransaction) => Promise<T>,
) => Promise<T>;

type BackendCapability = "getUserRoot" | "listUserResources" | "legacy";

/**
 * Abstracts user resource discovery with backward compatibility.
 *
 * Detects backend capability on the first getUserRoot() call and remembers
 * the result. Three-tier fallback:
 * 1. getUserRoot RPC (newest, supports doNotCreate)
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
  async getUserRoot(): Promise<ResourceId>;
  async getUserRoot(opts: { login?: string }): Promise<ResourceId>;
  async getUserRoot(opts: { login?: string; doNotCreate: false }): Promise<ResourceId>;
  async getUserRoot(opts: { login?: string; doNotCreate: true }): Promise<ResourceId | undefined>;
  async getUserRoot(
    opts: { login?: string; doNotCreate?: boolean } = {},
  ): Promise<ResourceId | undefined> {
    if (this.backendCapability === undefined) {
      return await this.detectAndGetUserRoot(opts);
    }
    return await this.getUserRootWith(this.backendCapability, opts);
  }

  private async detectAndGetUserRoot(
    opts: { login?: string; doNotCreate?: boolean } = {},
  ): Promise<ResourceId | undefined> {
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
    opts: { login?: string; doNotCreate?: boolean } = {},
  ): Promise<ResourceId | undefined> {
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
    opts: { login?: string; doNotCreateUserRoot?: boolean } = {},
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

  // --- Newest path: getUserRoot RPC ---

  private async getUserRootViaRpc(opts: { login?: string }): Promise<ResourceId>;
  private async getUserRootViaRpc(opts: {
    login?: string;
    doNotCreate: false;
  }): Promise<ResourceId>;
  private async getUserRootViaRpc(opts: {
    login?: string;
    doNotCreate: true;
  }): Promise<ResourceId | undefined>;
  private async getUserRootViaRpc(
    opts: { login?: string; doNotCreate?: boolean } = {},
  ): Promise<ResourceId | undefined> {
    const resp = await this.ll.getUserRoot({
      login: opts.login,
      doNotCreate: opts.doNotCreate,
    });
    if (resp.userRoot === undefined) {
      if (opts.doNotCreate) return undefined;
      throw new Error("getUserRoot returned no userRoot entry");
    }
    return bigintToResourceId(
      resp.userRoot.resourceId,
      toResourceSignature(resp.userRoot.resourceSignature),
    );
  }

  // --- listUserResources path ---

  private async getUserRootViaList(opts: { login?: string }): Promise<ResourceId>;
  private async getUserRootViaList(opts: {
    login?: string;
    doNotCreate: false;
  }): Promise<ResourceId>;
  private async getUserRootViaList(opts: {
    login?: string;
    doNotCreate: true;
  }): Promise<ResourceId | undefined>;
  private async getUserRootViaList(
    opts: { login?: string; doNotCreate?: boolean } = {},
  ): Promise<ResourceId | undefined> {
    const responses = await this.ll.listUserResources({ login: opts.login, limit: 1 });
    for (const msg of responses) {
      if (msg.entry.oneofKind === "userRoot") {
        return bigintToResourceId(
          msg.entry.userRoot.resourceId,
          toResourceSignature(msg.entry.userRoot.resourceSignature),
        );
      }
    }
    throw new Error("listUserResources returned no userRoot entry");
  }

  private async getDataLibrariesViaList(
    opts: { login?: string } = {},
  ): Promise<ReadonlyMap<string, StorageInfo>> {
    const responses = await this.ll.listUserResources({ login: opts.login });

    // Collect all LS/* shared resources, separating V1 and V2
    const v1Entries: StorageInfo[] = [];
    const v2ResourceIds: { resourceId: ResourceId; resourceType: ResourceType }[] = [];

    for (const msg of responses) {
      if (msg.entry.oneofKind !== "sharedResource") continue;
      const sr = msg.entry.sharedResource;

      if (!sr.resourceType) continue;
      const typeName = sr.resourceType.name;
      const typeVersion = sr.resourceType.version;
      if (!typeName.startsWith(LsStorageTypePrefix)) continue;

      const rId = bigintToResourceId(sr.resourceId, toResourceSignature(sr.resourceSignature));
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
      v2Entries = await this.runTx("ReadLsStorageV2Data", false, NullResourceId, async (tx) => {
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
      });
    }

    const result = new Map<string, StorageInfo>();
    for (const entry of [...v1Entries, ...v2Entries]) {
      result.set(entry.storageId, entry);
    }
    return result;
  }

  // --- Legacy path: named resources ---

  private async getUserRootViaLegacy(opts: { login?: string }): Promise<ResourceId>;
  private async getUserRootViaLegacy(opts: {
    login?: string;
    doNotCreateUserRoot: false;
  }): Promise<ResourceId>;
  private async getUserRootViaLegacy(opts: {
    login?: string;
    doNotCreateUserRoot: true;
  }): Promise<ResourceId | undefined>;
  private async getUserRootViaLegacy(
    opts: { login?: string; doNotCreateUserRoot?: boolean } = {},
  ): Promise<ResourceId | undefined> {
    const login = opts.login ?? this.authUser;
    const mainRootName =
      login === null ? AnonymousClientRoot : createHash("sha256").update(login).digest("hex");

    return await this.runTx("initialization", true, NullResourceId, async (tx) => {
      if (await tx.checkResourceNameExists(mainRootName)) {
        return await tx.getResourceByName(mainRootName);
      }

      if (opts.doNotCreateUserRoot) {
        return undefined;
      }

      const mainRoot = tx.createRoot(ClientRoot);
      tx.setResourceName(mainRootName, mainRoot);
      await tx.commit();
      return await toGlobalResourceId(mainRoot);
    });
  }

  private async getDataLibrariesViaLegacy(): Promise<ReadonlyMap<string, StorageInfo>> {
    return await this.runTx("GetAvailableStorageIds", false, NullResourceId, async (tx) => {
      const lsProviderId = await tx.getResourceByName("LSProvider");
      const provider = await tx.getResourceData(lsProviderId, true);

      const result = new Map<string, StorageInfo>();
      for (const field of provider.fields) {
        if (field.type !== "Dynamic" || !isNotNullResourceId(field.value)) continue;
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
