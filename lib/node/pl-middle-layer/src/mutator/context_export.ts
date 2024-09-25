import type { AnyRef, PlTransaction } from '@milaboratories/pl-client';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';
import { createRenderTemplate } from './template/render_template';
import { prepareTemplateSpec } from './template/template_loading';
import type { TemplateSpecPrepared } from '../model/template_spec';
import { createHash } from 'crypto';

export type TemplateEnvelop = { spec: TemplateSpecPrepared; hash: string };

let preparedTemplateEnvelop: TemplateEnvelop | undefined;

export async function getPreparedExportTemplateEnvelope(): Promise<TemplateEnvelop> {
  if (preparedTemplateEnvelop === undefined) {
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
