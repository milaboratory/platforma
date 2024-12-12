import type {
  ValueOrErrors,
} from '@platforma-sdk/model';
import { createMockApi, BlockMock } from '../../mock';

type Args = {
  x: number;
  y: number;
};

const defaultArgs = () => ({
  x: 0,
  y: 0,
});

type Outputs = {
  x: ValueOrErrors<number>;
  y: ValueOrErrors<number>;
  sum: ValueOrErrors<number>;
};

const defaultOutputs = (): Outputs => {
  return {
    x: {
      ok: true,
      value: 0,
    },
    y: {
      ok: true,
      value: 0,
    },
    sum: {
      ok: true,
      value: 0,
    },
  };
};

class BlockOld extends BlockMock<Args, Outputs, unknown, `/${string}`> {
  async process(): Promise<void> {
    const { args } = this;

    this.outputs.x = {
      ok: true,
      value: args.x,
    };

    this.outputs.y = {
      ok: true,
      value: args.y,
    };

    this.outputs.sum = {
      ok: true,
      value: args.x + args.y,
    };
  }
}

export const platforma = createMockApi<Args, Outputs>(new BlockOld(defaultArgs(), defaultOutputs(), undefined, '/'));
