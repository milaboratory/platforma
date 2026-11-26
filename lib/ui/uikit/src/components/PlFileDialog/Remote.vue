<script lang="ts" setup>
import { useEventListener } from "../../composition/useEventListener";
import type { ImportedFiles } from "../../types";
import { between, notEmpty, type Option } from "@milaboratories/helpers";
import {
  getRawPlatformaInstance,
  type ImportFileHandle,
  type StorageEntry,
  type StorageHandle,
} from "@platforma-sdk/model";
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import { PlDropdown } from "../PlDropdown";
import { PlIcon16 } from "../PlIcon16";
import Shortcuts from "./Shortcuts.vue";
import { PlMaskIcon16 } from "../PlMaskIcon16";
import { PlSearchField } from "../PlSearchField";
import style from "./pl-file-dialog.module.scss";
import { useVisibleItems, vTextOverflown } from "./remote-helpers";
import { getFilePathBreadcrumbs, normalizeExtensions, type FileDialogItem } from "./utils";
import {
  createConcurrencyLimiter,
  expandRemoteFolders,
  FolderListError,
} from "./remote-folder-walk";
import { isJunkName } from "./folder-walk";

// note that on a Mac, a click combined with the control key is intercepted by the operating system and used to open a context menu, so ctrlKey is not detectable on click events.
const isCtrlOrMeta = (ev: KeyboardEvent | MouseEvent) => ev.ctrlKey || ev.metaKey;

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    extensions?: string[]; // with dot, like ['.fastq.gz', '.fastq']
    multi?: boolean;
    allowFolders?: boolean;
    autoSelectStorage?: boolean;
    submit: () => void;
  }>(),
  {
    extensions: undefined,
    autoSelectStorage: true,
  },
);

const storageOptions = shallowRef<Option<StorageEntry>[]>([]);
const storageEntry = shallowRef<StorageEntry>();
const dirPath = shallowRef("");
const search = shallowRef("");
/** The entries of the open folder. Replaced, never mutated. */
const items = shallowRef<readonly FileDialogItem[]>([]);
/** Paths of the selected entries of the open folder. Replaced, never mutated. */
const selectedPaths = shallowRef<ReadonlySet<string>>(new Set());
const lastSelected = shallowRef<number>();
const currentLoadingPath = shallowRef<string>();
const showHiddenItems = shallowRef(false);
const error = shallowRef("");

const resetData = () => {
  search.value = "";
  error.value = "";
  lastSelected.value = undefined;
};

const resetAll = () => {
  storageOptions.value = [];
  storageEntry.value = undefined;
  dirPath.value = "";
  items.value = [];
  selectedPaths.value = new Set();
  currentLoadingPath.value = undefined;
  showHiddenItems.value = false;
  resetData();
};

const extensions = computed(() => normalizeExtensions(props.extensions));

/** Folders can be selected, and are imported as the files below them. */
const foldersEnabled = computed(() => props.multi === true && props.allowFolders === true);

const visibleItems = useVisibleItems(items, showHiddenItems, search);

const isSelected = (item: FileDialogItem) => selectedPaths.value.has(item.path);

const query = (storageHandle: StorageHandle, path: string) => {
  if (!getRawPlatformaInstance()) {
    return;
  }

  if (currentLoadingPath.value === path) {
    return;
  }

  currentLoadingPath.value = path;

  getRawPlatformaInstance()
    .lsDriver.listFiles(storageHandle, path)
    .then((res) => {
      if (path !== dirPath.value) {
        return;
      }

      const loaded = notEmpty(res)
        .entries.map((item) => ({
          path: item.fullPath,
          name: item.name,
          isDir: item.type === "dir",
          // A folder is imported as the files below it, so only where the block allows it.
          canBeSelected:
            item.type === "dir"
              ? foldersEnabled.value
              : !extensions.value || extensions.value.some((ext) => item.fullPath.endsWith(ext)),
          handle: item.type === "file" ? item.handle : undefined,
        }))
        .sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          // localeCompare for unicode alphabets
          return a.name.localeCompare(b.name);
        })
        .map((it, id) => ({ id, ...it }));
      items.value = loaded;

      // An opened folder that was selected stays selected as its contents.
      const inherited =
        openedSelected === path
          ? loaded.filter((item) => item.canBeSelected && !isJunkName(item.name))
          : [];
      openedSelected = undefined;
      selectedPaths.value = new Set(inherited.map((item) => item.path));
      inheritedFolders.value = new Set(
        inherited.filter((item) => item.isDir).map((item) => item.path),
      );

      lastSelected.value = undefined;
    })
    .catch((err) => (error.value = String(err)))
    .finally(() => {
      currentLoadingPath.value = undefined;
    });
};

const load = () => {
  resetData();
  const storageHandle = storageEntry.value?.handle;
  if (storageHandle && props.modelValue) {
    query(storageHandle, dirPath.value);
  }
};

const breadcrumbs = computed(() => getFilePathBreadcrumbs(dirPath.value));

const selectedFiles = computed(() =>
  items.value.filter((f) => f.canBeSelected && !f.isDir && isSelected(f)),
);

const selectedFolders = computed(() =>
  items.value.filter((f) => f.canBeSelected && f.isDir && isSelected(f)),
);

/**
 * The files below a selected folder, counted in the background as soon as it is selected.
 * Import reuses the result, so a finished count makes Import instant.
 */
type FolderCount =
  | { state: "counting"; controller: AbortController; filesFound: number; done: Promise<void> }
  | { state: "done"; handles: ImportFileHandle[] }
  | { state: "failed"; message: string };

/** Keyed by folder path within the current storage. Replaced, never mutated. */
const folderCounts = shallowRef<ReadonlyMap<string, FolderCount>>(new Map());

/** One cap on listing calls for all folders being counted at once. */
const listLimit = createConcurrencyLimiter(8);

const setFolderCount = (path: string, count: FolderCount | undefined) => {
  const next = new Map(folderCounts.value);
  if (count) next.set(path, count);
  else next.delete(path);
  folderCounts.value = next;
};

/**
 * Where below the selected folder listing failed and why, to follow the folder's name:
 * "/sub/dir: reason". The backend refuses a listing over its message size limit, which
 * a folder with very many entries reaches.
 */
const describeListError = (err: unknown, selected: string): string => {
  if (!(err instanceof FolderListError)) return `: ${String(err)}`;
  const trim = (p: string) => p.replace(/\/+$/, "");
  const below = trim(err.path).startsWith(trim(selected))
    ? trim(err.path).slice(trim(selected).length)
    : "";
  const reason = /received message larger than max/i.test(String(err.cause))
    ? "the folder has too many entries to list"
    : String(err.cause);
  return `${below}: ${reason}`;
};

const countFolder = (storageHandle: StorageHandle, path: string) => {
  const controller = new AbortController();
  const current = () => {
    const count = folderCounts.value.get(path);
    return count?.state === "counting" && count.controller === controller ? count : undefined;
  };
  const done = expandRemoteFolders(
    (storage, dir) => getRawPlatformaInstance().lsDriver.listFiles(storage, dir),
    storageHandle,
    [path],
    {
      extensions: extensions.value,
      signal: controller.signal,
      limit: listLimit,
      onProgress: ({ filesFound }) => {
        const count = current();
        if (count) setFolderCount(path, { ...count, filesFound });
      },
    },
  ).then(
    ({ handles }) => {
      if (current()) setFolderCount(path, { state: "done", handles });
    },
    (err) => {
      if (current())
        setFolderCount(path, { state: "failed", message: describeListError(err, path) });
    },
  );
  setFolderCount(path, { state: "counting", controller, filesFound: 0, done });
};

/**
 * Counts newly selected folders and stops counting deselected ones. Finished counts are
 * kept, so selecting a folder again costs nothing; failed ones are dropped to retry.
 */
const syncFolderCounts = () => {
  const storageHandle = storageEntry.value?.handle;
  if (!storageHandle) return;
  const wanted = new Set(selectedFolders.value.map((f) => f.path));
  for (const [path, count] of folderCounts.value) {
    if (wanted.has(path) || count.state === "done") continue;
    if (count.state === "counting") count.controller.abort();
    setFolderCount(path, undefined);
  }
  for (const path of wanted) {
    if (!folderCounts.value.has(path)) countFolder(storageHandle, path);
  }
};

const resetFolderCounts = () => {
  for (const count of folderCounts.value.values()) {
    if (count.state === "counting") count.controller.abort();
  }
  folderCounts.value = new Map();
};

watch(() => selectedFolders.value.map((f) => f.path).join("\n"), syncFolderCounts);

/**
 * Subfolders selected because their selected parent was opened. Like the parent's own
 * count, they may hold nothing to import without blocking the rest; selecting one by hand
 * makes it an ordinary selection again.
 */
const inheritedFolders = shallowRef<ReadonlySet<string>>(new Set());

const makeExplicit = (paths: string[]) => {
  if (!paths.some((p) => inheritedFolders.value.has(p))) return;
  const next = new Set(inheritedFolders.value);
  for (const p of paths) next.delete(p);
  inheritedFolders.value = next;
};

const folderSummary = computed(() => {
  let files = 0;
  let counting = false;
  const empty: string[] = [];
  const emptyInherited: string[] = [];
  const failed: string[] = [];
  for (const folder of selectedFolders.value) {
    const count = folderCounts.value.get(folder.path);
    if (count === undefined || count.state === "counting") {
      counting = true;
      files += count?.filesFound ?? 0;
    } else if (count.state === "done") {
      files += count.handles.length;
      if (count.handles.length > 0) continue;
      if (inheritedFolders.value.has(folder.path)) emptyInherited.push(folder.name);
      else empty.push(folder.name);
    } else {
      failed.push(`${folder.name}${count.message}`);
    }
  }
  // Still nothing at all to import once everything is counted: name them after all.
  if (!counting && files + selectedFiles.value.length === 0) empty.push(...emptyInherited);
  return { files, counting, empty, failed };
});

/** Files, selected directly or found in selected folders. */
const selectedLabel = computed(() => {
  const { files: inFolders, counting } = folderSummary.value;
  return `Selected: ${selectedFiles.value.length + inFolders}${counting ? "…" : ""}`;
});

/** Why the selected folders cannot be imported as they are; empty when they can. */
const folderError = computed(() => {
  const { empty, failed } = folderSummary.value;
  if (failed.length > 0) return `Could not read ${failed.join("; ")}`;
  if (empty.length === 0) return "";
  const what = props.extensions
    ? `files with supported formats (${props.extensions.join(", ")})`
    : "files";
  return `No ${what} in: ${empty.join(", ")}. Deselect to import the rest.`;
});

/** Set while Import waits for selected folders to finish counting. */
const importing = shallowRef<AbortController>();

const isReady = computed(
  () =>
    selectedFiles.value.length + selectedFolders.value.length > 0 &&
    storageEntry.value?.handle !== undefined &&
    !folderError.value &&
    !importing.value,
);

const isImporting = computed(() => importing.value !== undefined);

/** Waits until none of `paths` is still being counted, or the signal aborts. */
const waitForFolderCounts = async (paths: string[], signal: AbortSignal) => {
  const aborted = new Promise<never>((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
  );
  aborted.catch(() => {});
  const pendingCounts = () => {
    syncFolderCounts();
    return paths.flatMap((path) => {
      const count = folderCounts.value.get(path);
      return count?.state === "counting" ? [count.done] : [];
    });
  };
  // A finished count can be replaced by a new one (deselected and selected again), so
  // check again after each wait.
  let pending = pendingCounts();
  while (pending.length > 0) {
    await Promise.race([Promise.all(pending), aborted]);
    pending = pendingCounts();
  }
};

/**
 * The files to import, with selected folders expanded. `undefined` when the wait is
 * cancelled or a selected folder cannot be imported; the reason is shown.
 */
const getFilesToImport = async (): Promise<ImportedFiles | undefined> => {
  const storageHandle = notEmpty(storageEntry.value?.handle);
  const files = selectedFiles.value.flatMap((f) => (f.handle ? [f.handle] : []));
  const folders = selectedFolders.value.map((f) => f.path);
  if (folders.length === 0) return { storageHandle, files };
  const selectionBefore = selectionKey.value;

  const controller = new AbortController();
  importing.value = controller;
  try {
    await waitForFolderCounts(folders, controller.signal);
  } catch {
    return undefined;
  } finally {
    importing.value = undefined;
  }
  // The selection changed while Import waited: import nothing rather than a stale list.
  if (selectionKey.value !== selectionBefore || folderError.value) return undefined;
  const inFolders: ImportFileHandle[] = [];
  for (const path of folders) {
    const count = folderCounts.value.get(path);
    if (count?.state !== "done") return undefined;
    inFolders.push(...count.handles);
  }
  return { storageHandle, files: [...files, ...inFolders] };
};

/** Stops waiting; the counts go on while their folders stay selected. */
const cancelImport = () => importing.value?.abort();

/** What Import would take; any change while Import waits cancels it. */
const selectionKey = computed(() =>
  [...selectedFiles.value, ...selectedFolders.value].map((f) => f.path).join("\n"),
);

watch(selectionKey, () => cancelImport());

onBeforeUnmount(() => {
  cancelImport();
  resetFolderCounts();
});

/** The folder being opened while selected; its contents load selected. */
let openedSelected: string | undefined;

const setDirPath = (path: string) => {
  openedSelected = undefined;
  dirPath.value = path;
};

const openFolder = (folder: FileDialogItem, wasSelected = isSelected(folder)) => {
  setDirPath(folder.path);
  if (wasSelected) openedSelected = folder.path;
};

/** A folder row's selection before the click that may start a double-click. */
let lastFolderClick: { path: string; wasSelected: boolean } | undefined;

const clickFolder = (ev: MouseEvent, folder: FileDialogItem) => {
  // The second click of a double-click opens the folder; it does not toggle it again.
  if (ev.detail > 1) return;
  lastFolderClick = { path: folder.path, wasSelected: isSelected(folder) };
  selectItem(ev, folder);
};

/** Opens the folder as it was before the double-click's first click changed it. */
const dblclickFolder = (folder: FileDialogItem) => {
  const before = lastFolderClick?.path === folder.path ? lastFolderClick.wasSelected : undefined;
  openFolder(folder, before ?? isSelected(folder));
};

const selectItem = (ev: MouseEvent, item: FileDialogItem) => {
  ev.preventDefault();
  if (!item.canBeSelected) return;

  const visible = visibleItems.value;
  const next = new Set(selectedPaths.value);

  if (!props.multi) {
    // One item at a time; clicking the selected one keeps it.
    for (const f of visible) next.delete(f.path);
    next.add(item.path);
    selectedPaths.value = next;
    makeExplicit([item.path]);
    return;
  }

  const select = !next.has(item.path);
  // A plain click keeps only this item; Ctrl/Cmd and Shift add to the selection.
  if (!isCtrlOrMeta(ev) && !ev.shiftKey) {
    for (const f of visible) next.delete(f.path);
  }
  if (select) next.add(item.path);
  else next.delete(item.path);

  const from = lastSelected.value;
  const range =
    ev.shiftKey && from !== undefined
      ? visible.filter((f) => f.canBeSelected && between(f.id, from, item.id))
      : [];
  for (const f of range) next.add(f.path);

  selectedPaths.value = next;
  makeExplicit([item.path, ...range.map((f) => f.path)]);
  if (next.has(item.path)) lastSelected.value = item.id;
};

const changeAll = (select: boolean) => {
  if (select && !props.multi) {
    return;
  }

  const targets = visibleItems.value.filter((f) => f.canBeSelected);
  const next = new Set(selectedPaths.value);
  for (const f of targets) {
    if (select) next.add(f.path);
    else next.delete(f.path);
  }
  selectedPaths.value = next;
  if (select) makeExplicit(targets.map((f) => f.path));
};

const selectAll = () => changeAll(true);

const deselectAll = () => changeAll(false);

const loadAvailableStorages = () => {
  resetData();
  deselectAll();
  if (!getRawPlatformaInstance()) {
    console.warn("platforma API is not found");
    return;
  }
  getRawPlatformaInstance()
    .lsDriver.getStorageList()
    .then((storageEntries) => {
      // local storage is always returned by the ML, so we need to remove it from remote dialog manually
      storageEntries = storageEntries.filter(
        (it) => it.id !== "local" && !it.id.startsWith("local_disk_"),
      );

      storageOptions.value = storageEntries.map((it) => ({
        text: it.name,
        value: it,
      }));

      const first = storageEntries[0];
      if (props.autoSelectStorage && first) {
        storageEntry.value = first;
      }
    })
    .catch((err) => (error.value = String(err)));
};

watch(
  storageEntry,
  (entry) => {
    resetData();
    resetFolderCounts();
    dirPath.value = entry?.initialFullPath ?? "";
  },
  { immediate: true },
);

watch([dirPath, storageEntry], () => {
  load();
});

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      loadAvailableStorages();
    } else {
      cancelImport();
      resetFolderCounts();
      resetAll();
    }
  },
  { immediate: true },
);

useEventListener(document, "keydown", (ev: KeyboardEvent) => {
  if (!props.modelValue) {
    return;
  }

  if (ev.target !== document.body) {
    return;
  }

  const ctrlOrMetaKey = isCtrlOrMeta(ev);

  if (ctrlOrMetaKey && ev.code === "KeyA") {
    ev.preventDefault();
    selectAll();
  }

  if (ctrlOrMetaKey && ev.shiftKey && ev.code === "Period") {
    ev.preventDefault();
    showHiddenItems.value = !showHiddenItems.value;
  }

  if (ev.code === "Enter") {
    props.submit();
  }
});

defineExpose({
  isReady,
  isImporting,
  getFilesToImport,
  cancelImport,
});

onMounted(loadAvailableStorages);

const lsContainerRef = shallowRef<HTMLElement>();
</script>

<template>
  <div :class="style.remote" data-testid="pl-file-dialog-remote" @click.stop="deselectAll">
    <div :class="style.search">
      <div>
        <PlDropdown
          :model-value="storageEntry"
          label="Select storage"
          @update:model-value="(entry) => (storageEntry = entry)"
          :options="storageOptions"
          data-testid="pl-file-dialog-storage"
        />
      </div>
      <div>
        <PlSearchField
          v-model="search"
          label="Search in folder"
          clearable
          data-testid="pl-file-dialog-search"
        />
      </div>
    </div>
    <div :class="style['ls-container']" ref="lsContainerRef" data-testid="pl-file-dialog-browser">
      <div :class="style['ls-head']">
        <div :class="style['breadcrumbs']" data-testid="pl-file-dialog-breadcrumbs">
          <template v-for="(s, i) in breadcrumbs" :key="i">
            <div
              :title="s.path"
              data-testid="pl-file-dialog-breadcrumb"
              @click="setDirPath(s.path)"
            >
              {{ s.name }}
            </div>
            <PlIcon16 v-if="s.index !== breadcrumbs.length - 1" name="chevron-right" />
          </template>
        </div>
        <div :class="style.selected">
          <span data-testid="pl-file-dialog-selected-count">{{ selectedLabel }}</span>
          <Shortcuts :container="lsContainerRef" />
        </div>
      </div>
      <div
        v-if="folderError"
        :class="[$style.status, 'alert-error']"
        data-testid="pl-file-dialog-import-error"
      >
        {{ folderError }}
      </div>
      <div
        v-else-if="importing"
        :class="$style.status"
        data-testid="pl-file-dialog-import-progress"
      >
        Collecting files… {{ folderSummary.files }} found
      </div>
      <div
        v-if="currentLoadingPath !== undefined"
        class="ls-loader"
        data-testid="pl-file-dialog-loading"
      >
        <i class="mask-24 mask-loading loader-icon" />
      </div>
      <div v-else-if="!storageEntry" :class="style['ls-empty']" data-testid="pl-file-dialog-empty">
        <div :class="style.cat" />
        <div :class="style.message">Select storage to preview</div>
      </div>
      <div v-else-if="error" :class="style['ls-error']" data-testid="pl-file-dialog-error">
        <div :class="style.cat" />
        <div :class="style.message">{{ error }}</div>
      </div>
      <div v-else :class="style['ls-body']" data-testid="pl-file-dialog-items">
        <template v-for="file in visibleItems" :key="file.id">
          <!-- Several files fit: the row selects the folder, its name and chevron open it. -->
          <div
            v-if="file.isDir && foldersEnabled"
            :class="{ [style.canBeSelected]: true, [style.selected]: isSelected(file) }"
            data-testid="pl-file-dialog-dir"
            @click.stop="(ev) => clickFolder(ev, file)"
            @dblclick.stop="dblclickFolder(file)"
          >
            <PlIcon16
              name="chevron-right"
              :class="$style.opener"
              data-testid="pl-file-dialog-dir-open"
              @click.stop="openFolder(file)"
            />
            <span
              v-text-overflown
              :class="$style.opener"
              :title="file.name"
              data-testid="pl-file-dialog-dir-name"
              @click.stop="openFolder(file)"
              >{{ file.name }}</span
            >
          </div>
          <div
            v-else-if="file.isDir"
            :class="style.isDir"
            data-testid="pl-file-dialog-dir"
            @click="setDirPath(file.path)"
          >
            <PlIcon16 name="chevron-right" />
            <span v-text-overflown :title="file.name">{{ file.name }}</span>
          </div>
          <div
            v-else
            :class="{
              [style.canBeSelected]: file.canBeSelected,
              [style.selected]: isSelected(file),
            }"
            data-testid="pl-file-dialog-file"
            @click.stop="(ev) => selectItem(ev, file)"
          >
            <PlMaskIcon16 name="box" :class="style.isFile" />
            <span v-text-overflown :title="file.name">{{ file.name }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style module>
.opener {
  cursor: pointer;
}

.opener:hover {
  text-decoration: underline;
}

.status {
  padding: 8px 24px 0;
  font-size: 14px;
  line-height: 20px;
}
</style>
