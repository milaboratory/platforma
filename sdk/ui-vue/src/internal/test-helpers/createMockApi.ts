import type {
  ValueWithUTag,
  ValueWithUTagAndAuthor,
  BlockState,
  PlatformaV2,
  BlockOutputsBase,
  ImportFileHandle,
  FileLike,
  ListFilesResult,
  LocalImportFileHandle,
  NavigationState,
  OpenDialogOps,
  OpenMultipleFilesResponse,
  OpenSingleFileResponse,
  StorageHandle,
  ResultOrError,
  AuthorMarker,
} from '@platforma-sdk/model';
import type { BlockMock } from './BlockMock';
import type { Operation } from 'fast-json-patch';
import { delay } from '@milaboratories/helpers';
import { getLsFilesResult } from './utils';

export function createMockApi<
  Args,
  Outputs extends BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(block: BlockMock<Args, Outputs, UiState, Href>): PlatformaV2<Args, Outputs, UiState, Href> {
  return {
    apiVersion: 2,
    sdkInfo: {
      sdkVersion: 'dev',
    },
    loadBlockState: async function (): Promise<ResultOrError<ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>>> {
      return block.loadBlockState();
    },
    getPatches: async function (uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>> {
      return block.getPatches(uTag);
    },
    async setBlockArgs(value: Args, author?: AuthorMarker): Promise<ResultOrError<void>> {
      return block.setBlockArgs(value, author);
    },
    async setBlockUiState(value: UiState, author?: AuthorMarker): Promise<ResultOrError<void>> {
      return block.setBlockUiState(value, author);
    },
    async setBlockArgsAndUiState(args: Args, uiState: UiState, author?: AuthorMarker): Promise<ResultOrError<void>> {
      return block.setBlockArgsAndUiState(args, uiState, author);
    },
    async setNavigationState(navigationState: NavigationState<Href>): Promise<ResultOrError<void>> {
      return block.setNavigationState(navigationState);
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
