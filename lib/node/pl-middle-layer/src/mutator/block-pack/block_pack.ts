import { AnyResourceRef, field, PlTransaction, ResourceType } from '@milaboratories/pl-client';
import { loadTemplate } from '../template/template_loading';
import { BlockPackExplicit, BlockPackSpecAny, BlockPackSpecPrepared } from '../../model';
import { assertNever, Signer } from '@milaboratories/ts-helpers';
import fs from 'node:fs';
import { Dispatcher, request } from 'undici';
import { createFrontend } from './frontend';
import { BlockConfig } from '@platforma-sdk/model';
import { loadPackDescription, RegistryV1 } from '@platforma-sdk/block-tools';
import { BlockPackInfo } from '../../model/block_pack';
import { resolveDevPacket } from '../../dev';
import { getDevV2PacketMtime } from '../../block_registry';

export const BlockPackCustomType: ResourceType = { name: 'BlockPackCustom', version: '1' };
export const BlockPackTemplateField = 'template';
export const BlockPackFrontendField = 'frontend';

/** Ensure trailing slash */
function tSlash(str: string): string {
  if (str.endsWith('/')) return str;
  else return `${str}/`;
}

export class BlockPackPreparer {
  constructor(
    private readonly signer: Signer,
    private readonly http?: Dispatcher
  ) {}

  public async getBlockConfig(spec: BlockPackSpecAny): Promise<BlockConfig> {
    switch (spec.type) {
      case 'explicit':
        return spec.config;

      case 'dev':
      case 'dev-v1': {
        const devPaths = await resolveDevPacket(spec.folder, false);
        const configContent = await fs.promises.readFile(devPaths.config, { encoding: 'utf-8' });
        return JSON.parse(configContent) as BlockConfig;
      }

      case 'dev-v2': {
        const description = await loadPackDescription(spec.folder);
        const configContent = await fs.promises.readFile(description.components.model.file, {
          encoding: 'utf-8'
        });
        return JSON.parse(configContent) as BlockConfig;
      }

      case 'from-registry-v1': {
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix(spec)}`;

        const configResponse = await request(`${urlPrefix}/config.json`, httpOptions);

        return (await configResponse.body.json()) as BlockConfig;
      }

      default:
        return assertNever(spec);
    }
  }

  public async prepare(spec: BlockPackSpecAny): Promise<BlockPackSpecPrepared> {
    switch (spec.type) {
      case 'explicit':
        return spec;

      case 'dev':
      case 'dev-v1': {
        const devPaths = await resolveDevPacket(spec.folder, false);

        // template
        const templateContent = await fs.promises.readFile(devPaths.workflow);

        // config
        const config = JSON.parse(
          await fs.promises.readFile(devPaths.config, 'utf-8')
        ) as BlockConfig;

        // frontend
        const frontendPath = devPaths.ui;

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent
          },
          config,
          frontend: {
            type: 'local',
            path: frontendPath,
            signature: this.signer.sign(frontendPath)
          },
          source: spec
        };
      }

      case 'dev-v2': {
        const description = await loadPackDescription(spec.folder);
        const config = JSON.parse(
          await fs.promises.readFile(description.components.model.file, {
            encoding: 'utf-8'
          })
        ) as BlockConfig;
        const workflowContent = await fs.promises.readFile(
          description.components.workflow.main.file
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
            content: workflowContent
          },
          config,
          frontend: {
            type: 'local',
            path: frontendPath,
            signature: this.signer.sign(frontendPath)
          },
          source
        };
      }

      case 'from-registry-v1': {
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const urlPrefix = `${tSlash(spec.registryUrl)}${RegistryV1.packageContentPrefix(spec)}`;

        const templateUrl = `${urlPrefix}/template.plj.gz`;
        // template
        const templateResponse = await request(templateUrl, httpOptions);
        if (templateResponse.statusCode !== 200)
          throw new Error(
            `Block not found in registry (url = ${templateUrl} ; code = ${templateResponse.statusCode}): ` +
              JSON.stringify(spec)
          );
        const templateContent = new Uint8Array(await templateResponse.body.arrayBuffer());

        // config
        const configResponse = await request(`${urlPrefix}/config.json`, httpOptions);
        const config = (await configResponse.body.json()) as BlockConfig;

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent
          },
          config,
          frontend: {
            type: 'url',
            url: `${urlPrefix}/frontend.tgz`
          },
          source: spec
        };
      }

      default:
        return assertNever(spec);
    }
  }
}

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackExplicit): AnyResourceRef {
  const blockPackInfo: BlockPackInfo = { config: spec.config, source: spec.source };
  const bp = tx.createStruct(BlockPackCustomType, JSON.stringify(blockPackInfo));
  tx.createField(field(bp, BlockPackTemplateField), 'Input', loadTemplate(tx, spec.template));
  tx.createField(field(bp, BlockPackFrontendField), 'Input', createFrontend(tx, spec.frontend));
  tx.lock(bp);

  return bp;
}

export function createBlockPack(tx: PlTransaction, spec: BlockPackSpecPrepared): AnyResourceRef {
  switch (spec.type) {
    case 'explicit':
      return createCustomBlockPack(tx, spec);
    default:
      return assertNever(spec.type);
  }
}
