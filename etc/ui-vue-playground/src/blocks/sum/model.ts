import type {
  ValueOrErrors,
} from '@platforma-sdk/model';
import { createMockApi } from '../../mock/api';
import { BlockMock } from '../../mock/block';

type Args = {
  x: number;
  y: number;
};

const defaultArgs = () => ({
  x: 0,
  y: 0,
});

type Outputs = {
  sum: ValueOrErrors<number>;
};

const defaultOutputs = (): Outputs => {
  return {
    sum: {
      ok: true,
      value: 0
    }
  }
};

class BlockSum extends BlockMock<Args, Outputs, unknown, `/${string}`> {
  async process(): Promise<void> {
    const {args} = this;

    this.outputs.sum = {
      ok: true,
      value: args.x + args.y
    };
  }
}

export const platforma = createMockApi<Args, Outputs>(new BlockSum(defaultArgs(), defaultOutputs(), undefined, '/'));