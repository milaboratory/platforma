<script lang="ts" setup>
import { useEventListener } from "../../composition/useEventListener";
import type { ImportedFiles } from "../../types";
import { between, notEmpty, tapIf } from "@milaboratories/helpers";
import {
  getRawPlatformaInstance,
  type ImportFileHandle,
  type StorageHandle,
} from "@platforma-sdk/model";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRef, watch } from "vue";
import { PlDropdown } from "../PlDropdown";
import { PlIcon16 } from "../PlIcon16";
import Shortcuts from "./Shortcuts.vue";
import { PlMaskIcon16 } from "../PlMaskIcon16";
import { PlSearchField } from "../PlSearchField";
import style from "./pl-file-dialog.module.scss";
import { defaultData, useVisibleItems, vTextOverflown } from "./remote-helpers";
import { getFilePathBreadcrumbs, normalizeExtensions, type FileDialogItem } from "./utils";
import { createLimiter, expandRemoteFolders } from "./remote-folder-walk";

// note that on a Mac, a click combined with the control key is intercepted by the operating system and used to open a context menu, so ctrlKey is not detectable on click events.
const isCtrlOrMeta = (ev: KeyboardEvent | MouseEvent) => ev.ctrlKey || ev.metaKey;

defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "import:files", value: ImportedFiles): void;
}>();

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    extensions?: string[]; // with dot, like ['.fastq.gz', '.fastq']
    multi?: boolean;
    title?: string;
    autoSelectStorage?: boolean;
    submit: () => void;
  }>(),
  {
    extensions: undefined,
    title: undefined,
    autoSelectStorage: true,
  },
);

const data = reactive(defaultData());

const resetData = () => {
  data.search = "";
  data.error = "";
  data.lastSelected = undefined;
};

const extensions = computed(() => normalizeExtensions(props.extensions));

const visibleItems = useVisibleItems(data);

const lookup = computed(() => {
  return {
    modelValue: props.modelValue,
    dirPath: data.dirPath,
    storageHandle: data.storageEntry?.handle,
  };
});

const query = (storageHandle: StorageHandle, dirPath: string) => {
  if (!getRawPlatformaInstance()) {
    return;
  }

  if (data.currentLoadingPath === dirPath) {
    return;
  }

  data.currentLoadingPath = dirPath;

  getRawPlatformaInstance()
    .lsDriver.listFiles(storageHandle, dirPath)
    .then((res) => {
      if (dirPath !== data.dirPath) {
        return;
      }

      data.items = notEmpty(res)
        .entries.map((item) => ({
          path: item.fullPath,
          name: item.name,
          isDir: item.type === "dir",
          // A folder is imported as the files below it, so only where several files fit.
          canBeSelected:
            item.type === "dir"
              ? !!props.multi
              : !extensions.value || extensions.value.some((ext) => item.fullPath.endsWith(ext)),
          handle: item.type === "file" ? item.handle : undefined,
          selected: false,
        }))
        .sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          // localeCompare for unicode alphabets
          return a.name.localeCompare(b.name);
        })
        .map((it, id) => ({ id, ...it }));

      data.lastSelected = undefined;
    })
    .catch((err) => (data.error = String(err)))
    .finally(() => {
      data.currentLoadingPath = undefined;
    });
};

const load = () => {
  resetData();
  const { storageHandle, dirPath, modelValue } = lookup.value;
  if (storageHandle && modelValue) {
    query(storageHandle, dirPath);
  }
};

const breadcrumbs = computed(() => getFilePathBreadcrumbs(data.dirPath));

const selectedFiles = computed(() =>
  data.items.filter((f) => f.canBeSelected && f.selected && !f.isDir),
);

const selectedFolders = computed(() =>
  data.items.filter((f) => f.canBeSelected && f.selected && f.isDir),
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
const listLimit = createLimiter(8);

const setFolderCount = (path: string, count: FolderCount | undefined) => {
  const next = new Map(folderCounts.value);
  if (count) next.set(path, count);
  else next.delete(path);
  folderCounts.value = next;
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
      if (current()) setFolderCount(path, { state: "failed", message: String(err) });
    },
  );
  setFolderCount(path, { state: "counting", controller, filesFound: 0, done });
};

/**
 * Counts newly selected folders and stops counting deselected ones. Finished counts are
 * kept, so selecting a folder again costs nothing; failed ones are dropped to retry.
 */
const syncFolderCounts = () => {
  const storageHandle = data.storageEntry?.handle;
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

const folderSummary = computed(() => {
  let files = 0;
  let counting = false;
  const empty: string[] = [];
  const failed: string[] = [];
  for (const folder of selectedFolders.value) {
    const count = folderCounts.value.get(folder.path);
    if (count === undefined || count.state === "counting") {
      counting = true;
      files += count?.filesFound ?? 0;
    } else if (count.state === "done") {
      files += count.handles.length;
      if (count.handles.length === 0) empty.push(folder.name);
    } else {
      failed.push(`${folder.name} (${count.message})`);
    }
  }
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
  if (failed.length > 0) return `Could not read: ${failed.join(", ")}`;
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
    !!data.storageEntry?.handle &&
    !folderError.value &&
    !importing.value,
);

const isImporting = computed(() => !!importing.value);

/** Waits until none of `paths` is still being counted, or the signal aborts. */
const waitForFolderCounts = async (paths: string[], signal: AbortSignal) => {
  const aborted = new Promise<never>((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
  );
  aborted.catch(() => {});
  for (;;) {
    syncFolderCounts();
    const pending = paths.flatMap((path) => {
      const count = folderCounts.value.get(path);
      return count?.state === "counting" ? [count.done] : [];
    });
    if (pending.length === 0) return;
    await Promise.race([Promise.all(pending), aborted]);
  }
};

/**
 * The files to import, with selected folders expanded. `undefined` when the wait is
 * cancelled or a selected folder cannot be imported; the reason is shown.
 */
const getFilesToImport = async (): Promise<ImportedFiles | undefined> => {
  const storageHandle = notEmpty(data.storageEntry?.handle);
  const files = selectedFiles.value.flatMap((f) => (f.handle ? [f.handle] : []));
  const folders = selectedFolders.value.map((f) => f.path);
  if (folders.length === 0) return { storageHandle, files };

  const controller = new AbortController();
  importing.value = controller;
  try {
    await waitForFolderCounts(folders, controller.signal);
  } catch {
    return undefined;
  } finally {
    importing.value = undefined;
  }
  if (folderError.value) return undefined;
  const inFolders: ImportFileHandle[] = [];
  for (const path of folders) {
    const count = folderCounts.value.get(path);
    // Deselected while waiting: the selection changed under Import, so do nothing.
    if (count?.state !== "done") return undefined;
    inFolders.push(...count.handles);
  }
  return { storageHandle, files: [...files, ...inFolders] };
};

/** Stops waiting; the counts go on while their folders stay selected. */
const cancelImport = () => importing.value?.abort();

onBeforeUnmount(() => {
  cancelImport();
  resetFolderCounts();
});

const setDirPath = (dirPath: string) => {
  data.dirPath = dirPath;
};

const selectFile = (ev: MouseEvent, file: FileDialogItem) => {
  const { shiftKey } = ev;

  const ctrlOrMetaKey = isCtrlOrMeta(ev);

  const { lastSelected } = data;

  ev.preventDefault();

  const items = visibleItems.value;

  if (file.canBeSelected) {
    if (!props.multi) {
      items.forEach((f) => (f.selected = false));
    }

    file.selected = !file.selected;

    if (!props.multi) {
      return;
    }

    if (!ctrlOrMetaKey && !shiftKey) {
      items.forEach((f) => {
        if (f.id !== file.id) {
          f.selected = false;
        }
      });
    }

    if (shiftKey && lastSelected !== undefined) {
      items.forEach((f) => {
        if (f.canBeSelected && between(f.id, lastSelected, file.id)) {
          f.selected = true;
        }
      });
    }

    if (file.selected) {
      data.lastSelected = file.id;
    }
  }
};

const changeAll = (selected: boolean) => {
  if (selected && !props.multi) {
    return;
  }

  visibleItems.value
    .filter((f) => f.canBeSelected)
    .forEach((file) => {
      file.selected = selected;
    });
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

      data.storageOptions = storageEntries.map((it) => ({
        text: it.name,
        value: it,
      }));

      if (props.autoSelectStorage) {
        tapIf(storageEntries[0], (entry) => {
          data.storageEntry = entry;
        });
      }
    })
    .catch((err) => (data.error = String(err)));
};

watch(
  toRef(data, "storageEntry"),
  (entry) => {
    resetData();
    resetFolderCounts();
    data.dirPath = entry?.initialFullPath ?? "";
  },
  { immediate: true },
);

watch([() => data.dirPath, () => data.storageEntry], () => {
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
      Object.assign(data, defaultData());
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
    data.showHiddenItems = !data.showHiddenItems;
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

const lsContainerRef = ref<HTMLElement | undefined>();
</script>

<template>
  <div :class="style.remote" data-testid="pl-file-dialog-remote" @click.stop="deselectAll">
    <div :class="style.search">
      <div>
        <PlDropdown
          v-model="data.storageEntry"
          label="Select storage"
          :options="data.storageOptions"
          data-testid="pl-file-dialog-storage"
        />
      </div>
      <div>
        <PlSearchField
          v-model="data.search"
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
        v-if="data.currentLoadingPath !== undefined"
        class="ls-loader"
        data-testid="pl-file-dialog-loading"
      >
        <i class="mask-24 mask-loading loader-icon" />
      </div>
      <div
        v-else-if="!data.storageEntry"
        :class="style['ls-empty']"
        data-testid="pl-file-dialog-empty"
      >
        <div :class="style.cat" />
        <div :class="style.message">Select storage to preview</div>
      </div>
      <div v-else-if="data.error" :class="style['ls-error']" data-testid="pl-file-dialog-error">
        <div :class="style.cat" />
        <div :class="style.message">{{ data.error }}</div>
      </div>
      <div v-else :class="style['ls-body']" data-testid="pl-file-dialog-items">
        <template v-for="file in visibleItems" :key="file.id">
          <!-- Several files fit: the row selects the folder, its name and chevron open it. -->
          <div
            v-if="file.isDir && multi"
            :class="{ [style.canBeSelected]: true, [style.selected]: file.selected }"
            data-testid="pl-file-dialog-dir"
            @click.stop="(ev) => selectFile(ev, file)"
            @dblclick.stop="setDirPath(file.path)"
          >
            <PlIcon16
              name="chevron-right"
              :class="$style.opener"
              data-testid="pl-file-dialog-dir-open"
              @click.stop="setDirPath(file.path)"
            />
            <span
              v-text-overflown
              :class="$style.opener"
              :title="file.name"
              data-testid="pl-file-dialog-dir-name"
              @click.stop="setDirPath(file.path)"
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
            :class="{ [style.canBeSelected]: file.canBeSelected, [style.selected]: file.selected }"
            data-testid="pl-file-dialog-file"
            @click.stop="(ev) => selectFile(ev, file)"
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
