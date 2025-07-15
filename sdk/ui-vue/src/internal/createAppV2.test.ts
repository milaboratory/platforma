import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppV2 } from './createAppV2';
import { unwrapResult, type ValueOrErrors } from '@platforma-sdk/model';
import { BlockMock } from './test-helpers/BlockMock';
import { delay } from '@milaboratories/helpers';
import { createMockApi } from './test-helpers/createMockApi';
import { watch } from 'vue';

type Args = {
  x: number;
  y: number;
};

type UiState = {
  label: string;
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
      value: 0,
    },
  };
};

class BlockSum extends BlockMock<Args, Outputs, UiState, `/${string}`> {
  async process(): Promise<void> {
    const { args } = this;

    this.outputs.sum = {
      ok: true,
      value: args.x + args.y,
    };
  }
}

export const platforma = createMockApi<Args, Outputs, UiState>(new BlockSum(
  defaultArgs(),
  defaultOutputs(), {
    label: '',
  }, '/'));

describe('createApp', { timeout: 20_000 }, () => {
  beforeEach(() => {
    // Mock window.addEventListener to prevent actual event listeners
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
    });
  });

  it('should create an app with reactive snapshot', async () => {
    const initialState = await platforma.loadBlockState().then(unwrapResult);

    const app = createAppV2(initialState, platforma, { debug: false, debounceSpan: 10 });

    expect(app.model.args).toEqual({ x: 0, y: 0 });
    expect(app.model.ui).toEqual({ label: '' });
    expect(app.snapshot.navigationState.href).toBe('/');

    let watchCountShallow = 0;

    watch(() => app.model.args, () => {
      watchCountShallow++;
    });

    app.model.args.x = 1;
    app.model.args.y = 2;

    const t1 = performance.now();
    await app.allSettled();
    await delay(100);
    const t2 = performance.now();
    console.log('allSettled', t2 - t1);

    expect(app.model.args).toEqual(app.snapshot.args);
    expect(app.model.args).toEqual({ x: 1, y: 2 });
    expect(app.model.outputs.sum).toEqual(3);

    app.model.args.x = 3;
    app.model.args.y = 3;

    const t3 = performance.now();
    await app.allSettled();
    await delay(100);
    const t4 = performance.now();
    console.log('allSettled', t4 - t3);

    expect(watchCountShallow).toBe(0); // no changes

    expect(app.model.args).toEqual(app.snapshot.args);
    expect(app.model.args).toEqual({ x: 3, y: 3 });
    expect(app.model.outputs.sum).toEqual(6);

    app.closedRef = true;
  });
});
