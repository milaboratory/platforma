import { randomInt, range, times, toList } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';
import type { ImportFileHandleUpload, ListFilesResult, LsEntry } from '@platforma-sdk/model';

export const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const d = new Map<string, LsEntry[]>();

export const getLsFilesResult = (path: string): ListFilesResult => {
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
            fullPath: dirPath + '/' + name
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
            localPath: dirPath + '/' + name
          })
        )}` as ImportFileHandleUpload;

        return {
          type: 'file',
          name,
          fullPath: dirPath + '/' + name,
          handle
        };
      })
    );
  }

  return {
    parent: '/',
    entries: d.get(path)!
  };
};
