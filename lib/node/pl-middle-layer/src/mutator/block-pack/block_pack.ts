import { AnyResourceRef, field, PlTransaction, ResourceType } from '@milaboratory/pl-client-v2';
import { loadTemplate } from '../template/template_loading';
import { BlockPackExplicit, BlockPackSpecAny, BlockPackSpecPrepared } from '../../model';
import { assertNever, Signer } from '@milaboratory/ts-helpers';
import fs from 'node:fs';
import { Dispatcher, request } from 'undici';
import { createFrontend } from './frontend';
import { BlockConfig } from '@milaboratory/sdk-ui';
import { packageContentPrefix } from '@milaboratory/pl-block-registry';
import { BlockPackInfo } from '../../model/block_pack';
import { resolveDevPacket } from '../../dev';

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

      case 'dev': {
        const devPaths = await resolveDevPacket(spec.folder, false);
        const configContent = await fs.promises.readFile(devPaths.config, { encoding: 'utf-8' });
        return JSON.parse(configContent) as BlockConfig;
      }

      case 'from-registry-v1': {
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const urlPrefix = `${tSlash(spec.registryUrl)}${packageContentPrefix(spec)}`;

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

      case 'dev': {
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

      case 'from-registry-v1': {
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const urlPrefix = `${tSlash(spec.registryUrl)}${packageContentPrefix(spec)}`;

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
