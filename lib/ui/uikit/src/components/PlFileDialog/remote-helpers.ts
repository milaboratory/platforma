import type { Option } from "@milaboratories/helpers";
import type { ImportFileHandle, StorageEntry } from "@platforma-sdk/model";
import type { FileDialogItem } from "./utils";
import { computed } from "vue";

export const defaultData = () => ({
  dirPath: "" as string,
  search: "",
  storageEntry: undefined as StorageEntry | undefined,
  items: [] as FileDialogItem[],
  error: "",
  storageOptions: [] as Option<StorageEntry>[],
  /**
   * The accumulated selection, keyed by full path so it survives folder
   * navigation — `items` is replaced on every listing, a row's identity is not.
   * Values are flat strings, so this stays a collection-reactive Map rather
   * than a deeply proxied tree.
   */
  selection: new Map<string, ImportFileHandle>(),
  lastSelected: undefined as number | undefined,
  currentLoadingPath: undefined as string | undefined,
  currentLoadingDepth: undefined as number | undefined,
  showHiddenItems: false,
  /**
   * Directory levels to list at once. 1 is one folder at a time; deeper values
   * bring files from sub-folders into the same list so a one-folder-per-sample
   * tree can be selected in a single pass.
   */
  depth: 1,
  /**
   * Whether the host's `lsDriver` honours {@link ListFilesOps}.
   *
   * A block bundles its own copy of this dialog but calls the host's driver, so
   * a new dialog frequently runs against an older host that ignores the option.
   * `undefined` until the first listing answers; once known to be false the
   * depth control is hidden rather than left as a silent no-op.
   */
  depthSupported: undefined as boolean | undefined,
  /** The last listing hit the entry cap and is incomplete. */
  truncated: false,
  /** Directories the last listing could not read. */
  unreadableDirs: 0,
});

export type Data = ReturnType<typeof defaultData>;

export function useVisibleItems(data: Data) {
  return computed(() => {
    let items = data.items;

    if (!data.showHiddenItems) {
      items = items.filter((it) => !it.name.startsWith("."));
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
      el.innerText = s.substring(0, 57) + "..." + s.substring(s.length - 10);
    }
  },
};
