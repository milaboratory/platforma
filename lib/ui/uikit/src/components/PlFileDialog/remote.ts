import type { Option } from '@milaboratories/helpers';
import type { StorageEntry } from '@platforma-sdk/model';
import type { FileDialogItem } from './utils';
import { computed } from 'vue';

export const defaultData = () => ({
  dirPath: '' as string,
  search: '',
  storageEntry: undefined as StorageEntry | undefined,
  items: [] as FileDialogItem[],
  error: '',
  storageOptions: [] as Option<StorageEntry>[],
  selected: [],
  lastSelected: undefined as number | undefined,
  currentLoadingPath: undefined as string | undefined,
  showHiddenItems: false,
});

export type Data = ReturnType<typeof defaultData>;

export function useVisibleItems(data: Data) {
  return computed(() => {
    let items = data.items;

    if (!data.showHiddenItems) {
      items = items.filter((it) => !it.name.startsWith('.'));
    }

    if (data.search) {
      const search = data.search.toLocaleLowerCase();
      items = items.filter((it) => it.name.toLocaleLowerCase().includes(search));
    }

    return items;
  });
}

export const vTextOverflown = {
  mounted: (el: HTMLElement) => {
    if (el.clientWidth < el.scrollWidth) {
      const s = el.innerText;
      el.innerText = s.substring(0, 57) + '...' + s.substring(s.length - 10);
    }
  },
};
