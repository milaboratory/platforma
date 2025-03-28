import type { BlockOutputsBase, ValueOrErrors } from '@milaboratories/pl-model-common';

export class OutputError extends Error {
  constructor(
    public readonly errors: string[],
    public readonly moreErrors: boolean,
  ) {
    super(`${errors.length}${moreErrors ? '+' : ''} errors, first error: ` + errors[0]);
  }
}

export function readOutput<T>(outputValue: ValueOrErrors<T>): T {
  if (!outputValue.ok) throw new OutputError(outputValue.errors, outputValue.moreErrors);
  return outputValue.value;
}

type ExtractValueType<V extends ValueOrErrors<unknown>> = Extract<V, { ok: true }>['value'];
type SimpleOutputs<Outputs extends BlockOutputsBase> = {
  [Key in keyof Outputs]: ExtractValueType<Outputs[Key]>;
};

export function wrapOutputs<Outputs extends BlockOutputsBase>(
  outputs: Outputs,
): SimpleOutputs<Outputs> {
  return new Proxy(outputs, {
    get(target, key: string) {
      return readOutput(target[key]);
    },
  }) as SimpleOutputs<Outputs>;
}
