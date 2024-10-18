import type {
  ValueOrErrors,
} from '@platforma-sdk/model';
import { createMockApi, BlockMock } from '../../mock';

type Args = {
  x: number;
  y: number;
};

type UiState = {
  label: ''
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

class BlockSum extends BlockMock<Args, Outputs, UiState, `/${string}`> {
  async process(): Promise<void> {
    const {args} = this;

    this.outputs.sum = {
      ok: true,
      value: args.x + args.y
    };
  }
}

export const platforma = createMockApi<Args, Outputs, UiState>(new BlockSum(defaultArgs(), defaultOutputs(), {
  label: ''
}, '/'));
