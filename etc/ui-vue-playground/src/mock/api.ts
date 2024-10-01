import { delay } from '@milaboratories/helpers';
import type {
  BlockOutputsBase,
  BlockState,
  BlockStatePatch,
  ListFilesResult,
  NavigationState,
  Platforma,
  StorageHandle,
} from '@platforma-sdk/model';
import { getLsFilesResult } from './utils';
import { BlockMock } from './block';

export function createMockApi<
  Args,
  Outputs extends BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`
>(block: BlockMock<Args, Outputs, UiState, Href>): Platforma<Args, Outputs> {

  type MyPatch = BlockStatePatch<Args, Outputs, UiState, Href>;

  type OnUpdates = (updates: MyPatch[]) => Promise<void>;

  const onUpdateListeners: OnUpdates[] = [];

  const setPatches = async (updates: MyPatch[]) => {
    await onUpdateListeners.map(cb => cb(updates));
  };

  block.onNewState(async patches => {
    console.log('patches fom back', patches);
    await setPatches(patches);
  });

  return {
    sdkInfo: {
      sdkVersion: 'dev',
    },
    loadBlockState: async function (): Promise<BlockState<Args, Outputs>> {
      return block.getState();
    },
    onStateUpdates(cb: OnUpdates): () => void {
      onUpdateListeners.push(cb);

      return () => {
        // do nothing
      };
    },
    async setBlockArgs(value: Args): Promise<void> {
      await setPatches([{
        key: 'args',
        value
      }]);

      await block.setBlockArgs(value);
    },
    async setBlockUiState(value: UiState): Promise<void> {
      await setPatches([{
        key: 'ui',
        value
      }]);
    },
    setBlockArgsAndUiState: function (_args: unknown, _state: unknown): Promise<void> {
      throw new Error('Function not implemented.');
    },
    async setNavigationState(navigationState: NavigationState<Href>): Promise<void> {
      console.log('set navigation', navigationState);
      await setPatches([{
        key: 'navigationState',
        value: navigationState
      }]);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blobDriver: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logDriver: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lsDriver: {
      async getStorageList() {
        return [
          {
            name: 'local',
            handle: 'local://test',
            initialFullPath: '/',
          },
        ];
      },
      async listFiles(_storage: StorageHandle, fullPath: string): Promise<ListFilesResult> {
        await delay(10);
        return getLsFilesResult(fullPath);
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pFrameDriver: undefined as any,
  }
}
