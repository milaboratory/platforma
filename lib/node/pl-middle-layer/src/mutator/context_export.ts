import { AnyRef, PlTransaction } from '@milaboratories/pl-client';
import { createRenderTemplate } from './template/render_template';
import { prepareTemplateSpec } from './template/template_loading';
import { TemplateSpecPrepared } from '../model/template_spec';
import { createHash } from 'crypto';
import { createRequire } from 'node:module';

// Workaround to prevent bundling of @platforma-sdk/workflow-tengo
// if bundling happens import.meta.dirname will be transfered as is without transferring corresponding assets
// Construct like new URL(…, import.meta.url) also does not work properly.
// const require = createRequire(import.meta.url);
// const SdkTemplates = require('@platforma-sdk/workflow-tengo').Templates;

import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';

export type TemplateEnvelop = { spec: TemplateSpecPrepared; hash: string };

let preparedTemplateEnvelop: TemplateEnvelop | undefined;

export async function getPreparedExportTemplateEnvelope(): Promise<TemplateEnvelop> {
  if (preparedTemplateEnvelop === undefined) {
    // (await import('@platforma-sdk/workflow-tengo')).Templates['pframes.export-pframe']
    const preparedTemplate = await prepareTemplateSpec(SdkTemplates['pframes.export-pframe']);
    if (preparedTemplate.type !== 'explicit') throw new Error('Unexpected prepared template type.');
    const hash = createHash('sha256').update(preparedTemplate.content).digest('hex');
    preparedTemplateEnvelop = { spec: preparedTemplate, hash };
  }

  return preparedTemplateEnvelop;
}

export function exportContext(tx: PlTransaction, exportTpl: AnyRef, ctx: AnyRef) {
  return createRenderTemplate(tx, exportTpl, true, { pf: ctx }, ['result']).result;
}
