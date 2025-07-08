import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { createApp } from '../createApp';
import type { ValueWithUTag, BlockState, Platforma, BlockOutputsBase, ImportFileHandle, FileLike, ListFilesResult, LocalImportFileHandle, NavigationState, OpenDialogOps, OpenMultipleFilesResponse, OpenSingleFileResponse, StorageHandle, ValueOrErrors } from '@platforma-sdk/model';
import type { BlockMock } from './BlockMock';
import type { Operation } from 'fast-json-patch';
import { delay } from '@milaboratories/helpers';
import { getLsFilesResult } from './utils';

export function createMockApi<
  Args,
  Outputs extends BlockOutputsBase,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(block: BlockMock<Args, Outputs, UiState, Href>): Platforma<Args, Outputs, UiState> {
  return {
    sdkInfo: {
      sdkVersion: 'dev',
    },
    loadBlockState: async function (): Promise<ValueWithUTag<BlockState<Args, Outputs, UiState, Href>>> {
      return {
        value: block.getState(),
        uTag: block.uTag,
      };
    },
    getPatches: async function (uTag: string): Promise<ValueWithUTag<Operation[]>> {
      return await block.getJsonPatches(uTag);
    },
    async setBlockArgs(value: Args): Promise<void> {
      await block.setBlockArgs(value);
    },
    async setBlockUiState(value: UiState): Promise<void> {
      await block.setBlockUiState(value);
    },
    async setBlockArgsAndUiState(args: Args, uiState: UiState): Promise<void> {
      await block.setBlockArgsAndUiState(args, uiState);
    },
    async setNavigationState(navigationState: NavigationState<Href>): Promise<void> {
      // await block.setNavigationState(navigationState);
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
