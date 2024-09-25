import { delay, randomInt, range, times, toList, unionize } from '@milaboratories/helpers';
import { wrapValueOrErrors } from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';
import type {
  BlockState,
  BlockStatePatch,
  ImportFileHandleUpload,
  ListFilesResult,
  LsEntry,
  NavigationState,
  Platforma,
  StorageHandle,
  ValueOrErrors,
} from '@platforma-sdk/model';

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const d = new Map<string, LsEntry[]>();

const getLsFilesResult = (path: string): ListFilesResult => {
  const length = randomInt(1, 1000);

  if (path.endsWith('11')) {
    throw Error('Some error ' + faker.lorem.paragraph() + faker.lorem.paragraph());
  }

  if (!d.has(path)) {
    const dirPath = path === '/' ? '' : path;

    d.set(
      path,
      toList(range(0, length)).map((i) => {
        if (i < 10) {
          let name = faker.word.noun();
          if (Math.random() < 0.2) {
            name = '.' + name;
          }
          return {
            type: 'dir',
            name,
            fullPath: dirPath + '/' + name,
          };
        }

        const name =
          times(randomInt(1, 40), () => {
            if (Math.random() < 0.2) {
              return capitalizeFirstLetter(faker.word.noun());
            }

            return faker.word.noun();
          }).join(' ') + faker.system.commonFileName();

        const handle = `upload://upload/${encodeURIComponent(
          JSON.stringify({
            localPath: dirPath + '/' + name,
          }),
        )}` as ImportFileHandleUpload;

        return {
          type: 'file',
          name,
          fullPath: dirPath + '/' + name,
          handle,
        };
      }),
    );
  }

  return {
    parent: '/',
    entries: d.get(path)!,
  };
};

type OnUpdates = (updates: BlockStatePatch<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`>[]) => Promise<void>;

const state: BlockState<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`> = {
  args: undefined,
  ui: undefined,
  navigationState: {
    href: '/form',
  },
  outputs: {},
};

const onUpdateListeners: OnUpdates[] = [];

const setPatches = async (updates: BlockStatePatch[]) => await Promise.all(onUpdateListeners.map((cb) => cb(updates)));

let x = 1;

const testError = {
  ok: false,
  errors: ['y contains an unknown error'],
  moreErrors: false,
} as ValueOrErrors<number>;

setInterval(() => {
  setPatches([
    {
      key: 'outputs',
      value: {
        x: wrapValueOrErrors(++x),
        y: x % 5 === 0 ? testError : wrapValueOrErrors(2),
      },
    },
  ]);
}, 2000);

export const platforma: Platforma = {
  sdkInfo: {
    sdkVersion: '',
  },
  loadBlockState: async function (): Promise<BlockState<unknown, Record<string, ValueOrErrors<unknown>>, unknown, `/${string}`>> {
    return state;
  },
  onStateUpdates: function (cb: OnUpdates): () => void {
    onUpdateListeners.push(cb);

    return () => {
      // do nothing
    };
  },
  setBlockArgs: function (_args: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setBlockUiState: function (_state: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setBlockArgsAndUiState: function (_args: unknown, _state: unknown): Promise<void> {
    throw new Error('Function not implemented.');
  },
  async setNavigationState(navigationState: NavigationState<`/${string}`>): Promise<void> {
    state.navigationState = navigationState;
    const updates = unionize(state) as BlockStatePatch[];
    onUpdateListeners.map((cb) => cb(updates));
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
};
