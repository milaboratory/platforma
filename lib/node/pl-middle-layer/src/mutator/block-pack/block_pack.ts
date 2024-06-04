import { AnyResourceRef, field, PlTransaction, ResourceType } from '@milaboratory/pl-client-v2';
import { loadTemplate } from './template';
import { BlockPackExplicit, BlockPackSpecAny, BlockPackSpecPrepared } from '../../model/block_pack_spec';
import { assertNever } from '@milaboratory/ts-helpers';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import { Dispatcher, request } from 'undici';
import { createFrontend } from './frontend';

export const BlockPackCustomType: ResourceType = { name: 'BlockPackCustom', version: '1' };
export const BlockPackTemplateField = 'template';
export const BlockPackFrontendField = 'frontend';

export class BlockPackPreparer {
  constructor(
    private readonly secret: string | Uint8Array,
    private readonly http?: Dispatcher) {
  }

  public async prepare(spec: BlockPackSpecAny): Promise<BlockPackSpecPrepared> {
    switch (spec.type) {
      case 'explicit':
        return spec;
      case 'dev': {
        // template
        const templateContent =
          await fs.promises.readFile(path.resolve(
            spec.folder,
            'backend', 'dist', 'tengo', 'tpl', 'main.plj.gz'));

        // config
        const configContent =
          await fs.promises.readFile(path.resolve(
            spec.folder,
            'config', 'dist', 'config.json'));

        // frontend
        const frontendPath = path.resolve(spec.folder, 'frontend', 'dist');
        const frontendPathSignature = createHmac('sha256', this.secret)
          .update(frontendPath).digest('hex');

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent
          },
          config: configContent,
          frontend: {
            type: 'local',
            path: frontendPath,
            signature: frontendPathSignature
          }
        };
      }

      case 'from-registry-v1': {
        const httpOptions = this.http !== undefined
          ? { dispatcher: this.http }
          : {};

        // template
        const templateResponse = await request(
          `${spec.url}/template.plj.gz`, httpOptions);
        const templateContent = new Uint8Array(
          await templateResponse.body.arrayBuffer());

        // config
        const configResponse = await request(
          `${spec.url}/config.json`, httpOptions);
        const configContent = new Uint8Array(
          await configResponse.body.arrayBuffer());

        return {
          type: 'explicit',
          template: {
            type: 'explicit',
            content: templateContent
          },
          config: configContent,
          frontend: {
            type: 'url',
            url: `${spec.url}/frontend.tgz`
          }
        };
      }

      default:
        return assertNever(spec);
    }
  }
}

function createCustomBlockPack(tx: PlTransaction, spec: BlockPackExplicit): AnyResourceRef {
  const bp = tx.createStruct(BlockPackCustomType, spec.config);
  tx.createField(field(bp, BlockPackTemplateField), 'Input',
    loadTemplate(tx, spec.template));
  tx.createField(field(bp, BlockPackFrontendField), 'Input',
    createFrontend(tx, spec.frontend));
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
