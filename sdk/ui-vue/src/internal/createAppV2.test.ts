import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppV2 } from './createAppV2';
import { type OutputWithStatus, unwrapResult } from '@platforma-sdk/model';
import { BlockStateMock } from './test-helpers/BlockMock';
import { BlockMock } from './test-helpers/BlockMock';
import { delay } from '@milaboratories/helpers';
import { createMockApi } from './test-helpers/createMockApi';
import { watch } from 'vue';
import { patchPoolingDelay } from './createAppV2';

type Args = {
  x: number;
  y: number;
};

type UiState = {
  label: string;
  delay?: number;
};

const defaultArgs = () => ({
  x: 0,
  y: 0,
});

type Outputs = {
  sum: OutputWithStatus<number>;
};

const defaultOutputs = (): Outputs => {
  return {
    sum: {
      ok: true,
      value: 0,
      stable: true,
    },
  };
};

const defaultState = (): BlockStateMock<Args, Outputs, UiState, `/${string}`> => {
  return new BlockStateMock(defaultArgs(), defaultOutputs(), { label: '' }, '/');
};

class BlockSum extends BlockMock<Args, Outputs, UiState, `/${string}`> {
  async process(): Promise<void> {
    const { args, author } = this.state;
    this.state.setState({ author, outputs: { sum: { ok: true, value: args.x + args.y, stable: true } } });
  }
}

export const platforma = createMockApi<Args, Outputs, UiState>(new BlockSum(defaultState()));

describe('createApp', { timeout: 20_000 }, () => {
  beforeEach(() => {
    // Mock window.addEventListener to prevent actual event listeners
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
    });
  });

  it('should create an app with reactive snapshot', async () => {
    const initialState = await platforma.loadBlockState().then(unwrapResult);

    const app = createAppV2(
      initialState,
      {
        ...platforma,
        blockModelInfo: {
          outputs: {
            sum: { withStatus: false },
          },
        },
      },
      { debug: true, debounceSpan: 10 },
    );

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
    await delay(patchPoolingDelay + 10);
    const t4 = performance.now();
    console.log('allSettled', t4 - t3);

    expect(watchCountShallow).toBe(0); // no changes

    expect(app.model.args).toEqual(app.snapshot.args);
    expect(app.model.args).toEqual({ x: 3, y: 3 });
    expect(app.model.outputs.sum).toEqual(6);

    app.closedRef = true;
  });

  it('states should be synchronized', async () => {
    const sharedBlock = new BlockSum(defaultState());
    const platforma1 = createMockApi<Args, Outputs, UiState>(sharedBlock);
    const platforma2 = createMockApi<Args, Outputs, UiState>(sharedBlock);

    const initialState1 = await platforma1.loadBlockState().then(unwrapResult);
    const initialState2 = await platforma2.loadBlockState().then(unwrapResult);

    const app1 = createAppV2(
      initialState1,
      {
        ...platforma1,
        blockModelInfo: {
          outputs: {
            sum: { withStatus: false },
          },
        },
      },
      { appId: 'app1', debug: true, debounceSpan: 10 },
    );
    const app2 = createAppV2(
      initialState2,
      {
        ...platforma2,
        blockModelInfo: {
          outputs: {
            sum: { withStatus: false },
          },
        },
      },
      { appId: 'app2', debug: true, debounceSpan: 10 },
    );

    app1.model.args.x = 1;
    app1.model.args.y = 2;

    await app1.allSettled();
    await app2.allSettled();

    expect(app1.model.args).toEqual(app2.model.args);
    expect(app1.model.args).toEqual({ x: 1, y: 2 });
    expect(app1.model.outputs.sum).toEqual(3);
    expect(app2.model.outputs.sum).toEqual(3);

    app2.model.args.x = 3;
    app2.model.args.y = 4;

    await Promise.all([app1.allSettled(), app2.allSettled()]);
    await delay(patchPoolingDelay + 10);

    expect(app1.model.args).toEqual(app2.model.args);
    expect(app1.model.args).toEqual({ x: 3, y: 4 });
    expect(app1.model.outputs.sum).toEqual(7);
    expect(app2.model.outputs.sum).toEqual(7);

    app1.model.args.x = 5;
    app1.model.args.y = 5;
    app1.model.ui.delay = 20;
    await delay(5);
    app2.model.args.x = 7;
    app2.model.args.y = 7;

    await Promise.all([app1.allSettled(), app2.allSettled()]);
    await delay(patchPoolingDelay + 10);

    expect(app1.model.args).toEqual(app1.snapshot.args);
    expect(app1.model.args).toEqual(app2.model.args);
    expect(app1.model.args).toEqual({ x: 5, y: 5 });
    expect(app1.model.outputs.sum).toEqual(10);
    expect(app2.model.outputs.sum).toEqual(10);

    app1.closedRef = true;
    app2.closedRef = true;
  });
});
