import type { AnyRef, PlTransaction } from '@milaboratories/pl-client';
import { field, Pl } from '@milaboratories/pl-client';
import type { ResourceType } from '@platforma-sdk/model';

const EphRenderTemplate: ResourceType = {
  name: 'EphRenderTemplate',
  version: '1',
};
const RenderTemplate: ResourceType = {
  name: 'RenderTemplate',
  version: '1',
};

/**
 * Creates render template operation, for a given remplate and inputs.
 *
 * @param tx transaction to use during rendering creation
 * @param tpl reference to the template resource (see {@link loadTemplate})
 * @param ephemeral true for ephemeral templates, false for pure templates
 * @param inputs map of inputs pointing to other resources or fields
 * @param outputNames names of the outputs to collect and return from this method
 */
export function createRenderTemplate<O extends string>(
  tx: PlTransaction,
  tpl: AnyRef,
  ephemeral: boolean,
  inputs: Pl.PlRecord,
  outputNames: O[],
): Record<O, AnyRef> {
  if (outputNames.length === 0) throw new Error('Zero output names provided');
  const rId = ephemeral ? tx.createEphemeral(EphRenderTemplate) : tx.createStruct(RenderTemplate);

  const tplField = field(rId, 'template');
  const inputsField = field(rId, 'inputs');

  tx.createField(tplField, 'Input', tpl);
  tx.createField(inputsField, 'Input', Pl.createPlMap(tx, inputs, ephemeral));
  tx.lockInputs(rId);

  return Pl.futureRecord(tx, rId, outputNames, 'Output', 'outputs/');
}
