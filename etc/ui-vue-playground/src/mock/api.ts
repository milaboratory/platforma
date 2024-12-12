import { delay } from '@milaboratories/helpers';
import type {
  BlockOutputsBase,
  BlockState,
  BlockStatePatch,
  FileLike,
  ImportFileHandle,
  ListFilesResult,
  LocalImportFileHandle,
  NavigationState,
  OpenDialogOps,
  OpenMultipleFilesResponse,
  OpenSingleFileResponse,
  Platforma,
  StorageHandle,
} from '@platforma-sdk/model';
import { getLsFilesResult } from './utils';
import type { BlockMock } from './BlockMock';

export function createMockApi<
  Args,
  Outputs extends BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(block: BlockMock<Args, Outputs, UiState, Href>): Platforma<Args, Outputs, UiState> {
  type MyPatch = BlockStatePatch<Args, Outputs, UiState, Href>;

  type OnUpdates = (updates: MyPatch[]) => Promise<void>;

  const onUpdateListeners: OnUpdates[] = [];

  const setPatches = async (updates: MyPatch[]) => {
    await onUpdateListeners.map((cb) => cb(updates));
  };

  block.onNewState(async (patches) => {
    await setPatches(patches);
  });

  return {
    sdkInfo: {
      sdkVersion: 'dev',
    },
    loadBlockState: async function (): Promise<BlockState<Args, Outputs, UiState>> {
      return block.getState();
    },
    onStateUpdates(cb: OnUpdates): () => void {
      onUpdateListeners.push(cb);

      return () => {
        // do nothing
      };
    },
    async setBlockArgs(value: Args): Promise<void> {
      await setPatches([
        {
          key: 'args',
          value,
        },
      ]);

      await block.setBlockArgs(value);
    },
    async setBlockUiState(value: UiState): Promise<void> {
      await setPatches([
        {
          key: 'ui',
          value,
        },
      ]);

      await block.setBlockUiState(value);
    },
    async setBlockArgsAndUiState(args: Args, uiState: UiState): Promise<void> {
      await setPatches([
        {
          key: 'args',
          value: args,
        },
        {
          key: 'ui',
          value: uiState,
        },
      ]);

      await block.setBlockArgsAndUiState(args, uiState);
    },
    async setNavigationState(navigationState: NavigationState<Href>): Promise<void> {
      await setPatches([
        {
          key: 'navigationState',
          value: navigationState,
        },
      ]);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blobDriver: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logDriver: undefined as any,

    lsDriver: {
      async getStorageList() {
        return [
          {
            name: 'local',
            handle: 'local://test',
            initialFullPath: '/',
            isInitialPathHome: false,
          },
        ];
      },
      async listFiles(_storage: StorageHandle, fullPath: string): Promise<ListFilesResult> {
        await delay(10);
        return getLsFilesResult(fullPath);
      },
      async getLocalFileContent(_file: LocalImportFileHandle): Promise<Uint8Array> {
        return Uint8Array.of(0, 1);
      },
      async getLocalFileSize(_file: LocalImportFileHandle): Promise<number> {
        return 3;
      },
      async showOpenMultipleFilesDialog(_ops: OpenDialogOps): Promise<OpenMultipleFilesResponse> {
        return {};
      },
      async showOpenSingleFileDialog(_ops: OpenDialogOps): Promise<OpenSingleFileResponse> {
        return {};
      },
      async fileToImportHandle(_file: FileLike): Promise<ImportFileHandle> {
        return '' as ImportFileHandle;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pFrameDriver: undefined as any,
  };
}
