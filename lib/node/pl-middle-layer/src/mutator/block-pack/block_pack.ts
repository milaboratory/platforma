import type { AnyResourceRef, PlTransaction, ResourceType } from '@milaboratories/pl-client';
import { field } from '@milaboratories/pl-client';
import { loadTemplate } from '../template/template_loading';
import type { BlockPackExplicit, BlockPackSpecAny, BlockPackSpecPrepared, BlockPackUnpacked } from '../../model';
import type { Signer } from '@milaboratories/ts-helpers';
import { assertNever } from '@milaboratories/ts-helpers';
import fs from 'node:fs';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { createFrontend } from './frontend';
import type { BlockConfigContainer } from '@platforma-sdk/model';
import { loadPackDescription, RegistryV1 } from '@platforma-sdk/block-tools';
import type { BlockPackInfo } from '../../model/block_pack';
import { resolveDevPacket } from '../../dev_env';
import { getDevV2PacketMtime } from '../../block_registry';
import type { V2RegistryProvider } from '../../block_registry/registry-v2-provider';
import { LRUCache } from 'lru-cache';
import { parseTemplateAsync } from '@milaboratories/pl-model-backend';

export const BlockPackCustomType: ResourceType = { name: 'BlockPackCustom', version: '1' };
export const BlockPackTemplateField = 'template';
export const BlockPackFrontendField = 'frontend';

/** Ensure trailing slash */
function tSlash(str: string): string {
  if (str.endsWith('/')) return str;
  else return `${str}/`;
}

function bufferToString(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('utf8');
}

function bufferToJson(buffer: ArrayBuffer): unknown {
  return JSON.parse(bufferToString(buffer));
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

  public async getBlockConfigContainer(spec: BlockPackSpecAny): Promise<BlockConfigContainer> {
    switch (spec.type) {
      case 'explicit':
        return spec.config;

      case 'unpacked':
        return spec.config;

      case 'dev-v1': {
        const devPaths = await resolveDevPacket(spec.folder, false);
        const configContent = await fs.promises.readFile(devPaths.config, { encoding: 'utf-8' });
        return JSON.parse(configContent) as BlockConfigContainer;
      }

      case 'dev-v2': {
        const description = await loadPackDescription(spec.folder);
        const configContent = await fs.promises.readFile(description.components.model.file, {
          encoding: 'utf-8',
        });
        return JSON.parse(configContent) as BlockConfigContainer;
      }

      case 'from-registry-v1': {
        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix({ organization: spec.id.organization, package: spec.id.name, version: spec.id.version })}`;

        const configResponse = await this.remoteContentCache.forceFetch(`${urlPrefix}/config.json`);
        return bufferToJson(configResponse) as BlockConfigContainer;
      }

      case 'from-registry-v2': {
        const registry = this.v2RegistryProvider.getRegistry(spec.registryUrl);
        const components = await registry.getComponents(spec.id);
        const configResponse = await this.remoteContentCache.forceFetch(components.model.url);
        return bufferToJson(configResponse) as BlockConfigContainer;
      }

      default:
        return assertNever(spec);
    }
  }

  public async prepare(spec: BlockPackSpecAny): Promise<BlockPackSpecPrepared> {
    const prepared = await this.prepareWithoutUnpacking(spec);

    if (prepared.type === 'unpacked') {
      return prepared;
    }

    return {
      ...prepared,
      type: 'unpacked',
      template: {
        type: 'unpacked',
        data: await parseTemplateAsync(prepared.template.content),
      },
    };
  }

  private async prepareWithoutUnpacking(spec: BlockPackSpecAny): Promise<BlockPackExplicit | BlockPackUnpacked> {
    switch (spec.type) {
      case 'explicit':
        return spec;

      case 'dev-v1': {
        const devPaths = await resolveDevPacket(spec.folder, false);

        // template
        const templateContent = await fs.promises.readFile(devPaths.workflow);

        // config
        const config = JSON.parse(
          await fs.promises.readFile(devPaths.config, 'utf-8'),
        ) as BlockConfigContainer;

        // frontend
        const frontendPath = devPaths.ui;

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent,
          },
          config,
          frontend: {
            type: 'local',
            path: frontendPath,
            signature: this.signer.sign(frontendPath),
          },
          source: spec,
        };
      }

      case 'dev-v2': {
        const description = await loadPackDescription(spec.folder);
        const config = JSON.parse(
          await fs.promises.readFile(description.components.model.file, {
            encoding: 'utf-8',
          }),
        ) as BlockConfigContainer;
        const workflowContent = await fs.promises.readFile(
          description.components.workflow.main.file,
        );
        const frontendPath = description.components.ui.folder;
        const source = { ...spec };
        if (spec.mtime === undefined)
          // if absent, calculating the mtime here, so the block will correctly show whether it can be updated
          source.mtime = await getDevV2PacketMtime(description);
        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: workflowContent,
          },
          config,
          frontend: {
            type: 'local',
            path: frontendPath,
            signature: this.signer.sign(frontendPath),
          },
          source,
        };
      }

      case 'from-registry-v1': {
        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix({ organization: spec.id.organization, package: spec.id.name, version: spec.id.version })}`;

        const templateUrl = `${urlPrefix}/template.plj.gz`;
        // template
        const templateResponse = await this.remoteContentCache.forceFetch(templateUrl);
        const templateContent = new Uint8Array(templateResponse);

        // config
        const configResponse = await this.remoteContentCache.forceFetch(`${urlPrefix}/config.json`);
        const config = bufferToJson(configResponse) as BlockConfigContainer;

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent,
          },
          config,
          frontend: {
            type: 'url',
            url: `${urlPrefix}/frontend.tgz`,
          },
          source: spec,
        };
      }

      case 'from-registry-v2': {
        const registry = this.v2RegistryProvider.getRegistry(spec.registryUrl);
        const components = await registry.getComponents(spec.id);
        const getModel = async () =>
          bufferToJson(await this.remoteContentCache.forceFetch(components.model.url)) as BlockConfigContainer;
        const getWorkflow = async () =>
          await this.remoteContentCache.forceFetch(components.workflow.main.url);

        const [model, workflow] = await Promise.all([getModel(), getWorkflow()]);

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: Buffer.from(workflow),
          },
          config: model,
          frontend: {
            type: 'url',
            url: components.ui.url,
          },
          source: spec,
        };
      }

      case 'unpacked':
        return spec;

      default:
        return assertNever(spec);
    }
  }
}

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackSpecPrepared): AnyResourceRef {
  const blockPackInfo: BlockPackInfo = { config: spec.config, source: spec.source };
  const bp = tx.createStruct(BlockPackCustomType, JSON.stringify(blockPackInfo));
  tx.createField(field(bp, BlockPackTemplateField), 'Input', loadTemplate(tx, spec.template));
  tx.createField(field(bp, BlockPackFrontendField), 'Input', createFrontend(tx, spec.frontend));
  tx.lock(bp);

  return bp;
}

export function createBlockPack(tx: PlTransaction, spec: BlockPackSpecPrepared): AnyResourceRef {
  switch (spec.type) {
    case 'unpacked':
      return createCustomBlockPack(tx, spec);
    default:
      return assertNever(spec.type);
  }
}
