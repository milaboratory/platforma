import type { AnyResourceRef, PlTransaction, ResourceType } from "@milaboratories/pl-client";
import { field } from "@milaboratories/pl-client";
import { loadTemplate } from "../template/template_loading";
import type { BlockPackExplicit, BlockPackSpecAny, BlockPackSpecPrepared } from "../../model";
import type { Signer } from "@milaboratories/ts-helpers";
import { assertNever, notEmpty } from "@milaboratories/ts-helpers";
import type { Branded } from "@milaboratories/pl-model-common";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Dispatcher } from "undici";
import { request } from "undici";
import { createFrontend } from "./frontend";
import { requiredCapabilitiesFromTemplate } from "./required_capabilities";
import type { BlockConfigContainer } from "@platforma-sdk/model";
import { Code } from "@platforma-sdk/model";
import {
  loadPackDescription,
  loadPackDescriptionFromManifest,
  RegistryV1,
} from "@platforma-sdk/block-tools";
import type { BlockPackInfo } from "../../model/block_pack";
import type { InstallablePackTemplate, PreparedTemplate } from "../../model/template_spec";
import { resolveDevPacket } from "../../dev_env";
import { getDevV2PacketMtime, getFromPackV2Mtime } from "../../block_registry";
import type { V2RegistryProvider } from "../../block_registry/registry-v2-provider";
import { LRUCache } from "lru-cache";
import canonicalize from "canonicalize";
import type { BlockPackFromRegistryV2, BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import { WorkerManager } from "../../worker/WorkerManager";
import { z } from "zod";

type PreparedCacheKey = Branded<string, "PreparedCacheKey">;

export const BlockPackCustomType: ResourceType = { name: "BlockPackCustom", version: "1" };
export const BlockPackTemplateField = "template";
export const BlockPackFrontendField = "frontend";

/** Ensure trailing slash */
function tSlash(str: string): string {
  if (str.endsWith("/")) return str;
  else return `${str}/`;
}

function parseStringConfig(configContent: string): BlockConfigContainer {
  const res = z.record(z.string(), z.unknown()).safeParse(JSON.parse(configContent));

  if (!res.success) {
    throw new Error("Invalid config content");
  }

  if (!Code.safeParse(res.data.code).success) {
    throw new Error("parseStringConfig:No code bundle");
  }

  return res.data as BlockConfigContainer;
}

function parseBufferConfig(buffer: ArrayBuffer): BlockConfigContainer {
  return parseStringConfig(Buffer.from(buffer).toString("utf8"));
}

export class BlockPackPreparer {
  constructor(
    private readonly v2RegistryProvider: V2RegistryProvider,
    private readonly signer: Signer,
    private readonly http?: Dispatcher,
  ) {}

  private readonly remoteContentCache = new LRUCache<string, ArrayBuffer>({
    max: 500,
    maxSize: 128 * 1024 * 1024,
    fetchMethod: async (key) => {
      const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};
      return await (await request(key, httpOptions)).body.arrayBuffer();
    },
    sizeCalculation: (value) => value.byteLength,
  });

  /** Parsed packs by sha256, so adding a block again does not parse its workflow again. */
  private readonly loadedPackCache = new LRUCache<string, LoadedPack>({ max: 50 });

  /** Cache of prepared block packs for registry specs (immutable by version). */
  private readonly preparedCache = new LRUCache<PreparedCacheKey, BlockPackSpecPrepared>({
    max: 50,
  });

  public async getBlockConfigContainer(spec: BlockPackSpecAny): Promise<BlockConfigContainer> {
    switch (spec.type) {
      case "explicit":
        return spec.config;

      case "prepared":
        return spec.config;

      case "dev-v1": {
        const devPaths = await resolveDevPacket(spec.folder, false);
        const configContent = await fs.promises.readFile(devPaths.config, { encoding: "utf-8" });
        return JSON.parse(configContent);
      }

      case "dev-v2": {
        const description = await loadPackDescription(spec.folder);
        const configContent = await fs.promises.readFile(description.components.model.file, {
          encoding: "utf-8",
        });
        return parseStringConfig(configContent);
      }

      case "from-pack-v2": {
        // packUrl is a file: URL (the facade emits URLs, not paths); convert at
        // this Node boundary before touching the filesystem.
        const packDir = fileURLToPath(spec.packUrl);
        const description = await loadPackDescriptionFromManifest(packDir);
        const configContent = await fs.promises.readFile(description.components.model.file, {
          encoding: "utf-8",
        });
        return parseStringConfig(configContent);
      }

      case "from-registry-v1": {
        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix({ organization: spec.id.organization, package: spec.id.name, version: spec.id.version })}`;

        const configResponse = await this.remoteContentCache.forceFetch(`${urlPrefix}/config.json`);
        return JSON.parse(Buffer.from(configResponse).toString("utf8"));
      }

      case "from-registry-v2": {
        const registry = this.v2RegistryProvider.getRegistry(spec.registryUrl);
        const components = await registry.getComponents(spec.id);
        const configResponse = await this.remoteContentCache.forceFetch(components.model.url);
        return parseBufferConfig(configResponse);
      }

      default:
        return assertNever(spec);
    }
  }

  /** Returns a stable cache key for registry specs (immutable by version). Dev specs return undefined. */
  private specKey(spec: BlockPackSpecAny): PreparedCacheKey | undefined {
    switch (spec.type) {
      case "from-registry-v1":
        return `v1:${spec.registryUrl}:${spec.id.organization}:${spec.id.name}:${spec.id.version}` as PreparedCacheKey;
      case "from-registry-v2":
        return `v2:${spec.registryUrl}:${canonicalize(spec.id)}` as PreparedCacheKey;
      default:
        return undefined; // dev, explicit, prepared — not cacheable
    }
  }

  public async prepare(spec: BlockPackSpecAny): Promise<BlockPackSpecPrepared> {
    if (spec.type === "prepared") {
      return spec;
    }

    // Check prepare cache for registry specs
    const key = this.specKey(spec);
    if (key) {
      const cached = this.preparedCache.get(key);
      if (cached) return cached;
    }

    const registryPack =
      spec.type === "from-registry-v2" ? await this.prepareRegistryPack(spec) : undefined;
    if (registryPack !== undefined) {
      if (key) this.preparedCache.set(key, registryPack);
      return registryPack;
    }

    const explicit = await this.prepareWithoutUnpacking(spec);

    // Local dev packs are parsed when installed, which also checks their required capabilities.
    const { localPath, content } = explicit.template;
    if (localPath !== undefined)
      return {
        ...explicit,
        type: "prepared",
        template: { type: "local-pack", path: localPath, sha256: packSha256(content) },
      };

    await using workerManager = new WorkerManager();

    const parsed = await workerManager.process("parseTemplate", explicit.template.content);

    const result: BlockPackSpecPrepared = {
      ...explicit,
      type: "prepared",
      template: {
        type: "prepared",
        data: parsed,
      },
      requiredCapabilities: requiredCapabilitiesFromTemplate(parsed),
    };

    if (key) {
      this.preparedCache.set(key, result);
    }

    return result;
  }

  /**
   * Prepares a v2 registry block from its manifest alone, without downloading the workflow.
   * Undefined when the manifest does not list the workflow pack's sha256.
   */
  private async prepareRegistryPack(
    spec: BlockPackFromRegistryV2,
  ): Promise<BlockPackSpecPrepared | undefined> {
    const registry = this.v2RegistryProvider.getRegistry(spec.registryUrl);
    const [manifest, components] = await Promise.all([
      registry.getManifest(spec.id),
      registry.getComponents(spec.id),
    ]);
    const workflowPath = manifest.description.components.workflow.main.path;
    const workflowFile = manifest.files.find((f) => f.name === workflowPath);
    if (workflowFile === undefined) return undefined;

    return {
      type: "prepared",
      template: {
        type: "registry-pack",
        url: components.workflow.main.url,
        sha256: workflowFile.sha256.toLowerCase(),
      },
      config: parseBufferConfig(await this.remoteContentCache.forceFetch(components.model.url)),
      frontend: { type: "url", url: components.ui.url },
      source: spec,
      requiredCapabilities: manifest.description.meta.requiredCapabilities,
    };
  }

  /**
   * Downloads or reads, checks and parses a pack the backend could not install.
   * @deprecated client-side template path; the backend installs packs via TengoTemplateInstall.
   */
  public async loadPack(template: InstallablePackTemplate): Promise<LoadedPack> {
    let content: Uint8Array | undefined;
    if (template.type === "local-pack") {
      // A rebuild after prepare would pair this config with another build's workflow.
      content = await fs.promises.readFile(template.path);
      if (packSha256(content) !== template.sha256)
        throw new Error(
          `workflow pack ${template.path} changed after the block was prepared; add the block again`,
        );
    }

    const cached = this.loadedPackCache.get(template.sha256);
    if (cached !== undefined) return cached;

    if (content === undefined && template.type === "registry-pack") {
      content = new Uint8Array(await this.remoteContentCache.forceFetch(template.url));
      const sha256 = packSha256(content);
      if (sha256 !== template.sha256) {
        // Do not keep a broken download for the next attempt.
        this.remoteContentCache.delete(template.url);
        throw new Error(
          `workflow pack ${template.url} has sha256 ${sha256}, expected ${template.sha256}`,
        );
      }
    }

    await using workerManager = new WorkerManager();
    const parsed = await workerManager.process("parseTemplate", notEmpty(content));
    const loaded: LoadedPack = {
      template: { type: "prepared", data: parsed },
      requiredCapabilities: requiredCapabilitiesFromTemplate(parsed),
    };
    this.loadedPackCache.set(template.sha256, loaded);
    return loaded;
  }

  private async prepareWithoutUnpacking(
    spec: BlockPackExplicit | BlockPackSpec,
  ): Promise<BlockPackExplicit> {
    switch (spec.type) {
      case "explicit":
        return spec;

      case "dev-v1": {
        const devPaths = await resolveDevPacket(spec.folder, false);

        // template
        const templateContent = await fs.promises.readFile(devPaths.workflow);

        // config
        const config = JSON.parse(await fs.promises.readFile(devPaths.config, "utf-8"));

        // frontend
        const frontendPath = devPaths.ui;

        return {
          type: "explicit",
          template: {
            type: "explicit",
            content: templateContent,
          },
          config,
          frontend: {
            type: "local",
            path: frontendPath,
            signature: this.signer.sign(frontendPath),
          },
          source: spec,
        };
      }

      case "dev-v2": {
        const description = await loadPackDescription(spec.folder);
        const config = parseStringConfig(
          await fs.promises.readFile(description.components.model.file, {
            encoding: "utf-8",
          }),
        );
        const workflowContent = await fs.promises.readFile(
          description.components.workflow.main.file,
        );
        const frontendPath = description.components.ui.folder;
        const source = { ...spec };
        if (spec.mtime === undefined)
          // if absent, calculating the mtime here, so the block will correctly show whether it can be updated
          source.mtime = await getDevV2PacketMtime(description);
        return {
          type: "explicit",
          template: {
            type: "explicit",
            content: workflowContent,
            localPath: description.components.workflow.main.file,
          },
          config,
          frontend: {
            type: "local",
            path: frontendPath,
            signature: this.signer.sign(frontendPath),
          },
          source,
        };
      }

      case "from-pack-v2": {
        // packUrl is a file: URL (the facade emits URLs, not paths); convert at
        // this Node boundary before touching the filesystem.
        const packDir = fileURLToPath(spec.packUrl);
        const description = await loadPackDescriptionFromManifest(packDir);
        const config = parseStringConfig(
          await fs.promises.readFile(description.components.model.file, {
            encoding: "utf-8",
          }),
        );
        const workflowContent = await fs.promises.readFile(
          description.components.workflow.main.file,
        );
        // UI ships as ui.tgz inside block-pack/; its absolute path is carried
        // in the ui folder slot. The tarball is unpacked lazily at serve-time by
        // the download driver (local-tgz frontend), not eagerly here — so it
        // inherits the driver's usage-tracking and space recycling.
        const uiTgzPath = description.components.ui.folder;
        const source = { ...spec };
        let mtime = spec.mtime;
        if (mtime === undefined) {
          // No explicit mtime: derive one so the frontend cache key invalidates
          // when the block changes.
          mtime = await getFromPackV2Mtime(packDir, uiTgzPath);
          source.mtime = mtime;
        }
        return {
          type: "explicit",
          template: {
            type: "explicit",
            content: workflowContent,
            localPath: description.components.workflow.main.file,
          },
          config,
          frontend: {
            type: "local-tgz",
            path: uiTgzPath,
            mtime,
            signature: this.signer.sign(`${uiTgzPath}:${mtime}`),
          },
          source,
        };
      }

      case "from-registry-v1": {
        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix({ organization: spec.id.organization, package: spec.id.name, version: spec.id.version })}`;

        const templateUrl = `${urlPrefix}/template.plj.gz`;
        // template
        const templateResponse = await this.remoteContentCache.forceFetch(templateUrl);
        const templateContent = new Uint8Array(templateResponse);

        // config
        const configResponse = await this.remoteContentCache.forceFetch(`${urlPrefix}/config.json`);
        const config = JSON.parse(
          Buffer.from(configResponse).toString("utf8"),
        ) as BlockConfigContainer;

        return {
          type: "explicit",
          template: {
            type: "explicit",
            content: templateContent,
          },
          config,
          frontend: {
            type: "url",
            url: `${urlPrefix}/frontend.tgz`,
          },
          source: spec,
        };
      }

      case "from-registry-v2": {
        const registry = this.v2RegistryProvider.getRegistry(spec.registryUrl);
        const components = await registry.getComponents(spec.id);
        const getModel = async () =>
          parseBufferConfig(await this.remoteContentCache.forceFetch(components.model.url));
        const getWorkflow = async () =>
          await this.remoteContentCache.forceFetch(components.workflow.main.url);

        const [model, workflow] = await Promise.all([getModel(), getWorkflow()]);
        const workflowContent = Buffer.from(workflow);

        return {
          type: "explicit",
          template: {
            type: "explicit",
            content: workflowContent,
          },
          config: model,
          frontend: {
            type: "url",
            url: components.ui.url,
          },
          source: spec,
        };
      }

      default:
        return assertNever(spec);
    }
  }
}

/** A pack parsed on the client, with the capabilities it declares. */
type LoadedPack = { template: PreparedTemplate; requiredCapabilities?: string[] };

/** Lowercase hex sha256 of a gzipped workflow pack, the key the backend installs it by. */
export function packSha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackSpecPrepared): AnyResourceRef {
  if (spec.template.type === "registry-pack" || spec.template.type === "local-pack")
    throw new Error("BUG: a pack must be installed by cacheBlockPackTemplate first");
  const blockPackInfo: BlockPackInfo = { config: spec.config, source: spec.source };
  const bp = tx.createStruct(BlockPackCustomType, JSON.stringify(blockPackInfo));
  tx.createField(field(bp, BlockPackTemplateField), "Input", loadTemplate(tx, spec.template));
  tx.createField(field(bp, BlockPackFrontendField), "Input", createFrontend(tx, spec.frontend));
  tx.lock(bp);

  return bp;
}

export function createBlockPack(tx: PlTransaction, spec: BlockPackSpecPrepared): AnyResourceRef {
  switch (spec.type) {
    case "prepared":
      return createCustomBlockPack(tx, spec);
    default:
      return assertNever(spec.type);
  }
}
