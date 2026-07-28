<script lang="ts" setup>
import { useEventListener } from "../../composition/useEventListener";
import type { ImportedFiles, SimpleOption } from "../../types";
import { between, notEmpty, tapIf } from "@milaboratories/helpers";
import { getRawPlatformaInstance, type StorageHandle } from "@platforma-sdk/model";
import { computed, onMounted, reactive, ref, toRef, watch } from "vue";
import { PlDropdown } from "../PlDropdown";
import { PlIcon16 } from "../PlIcon16";
import Shortcuts from "./Shortcuts.vue";
import { PlMaskIcon16 } from "../PlMaskIcon16";
import { PlSearchField } from "../PlSearchField";
import style from "./pl-file-dialog.module.scss";
import { defaultData, useVisibleItems, vTextOverflown } from "./remote-helpers";
import { getFilePathBreadcrumbs, normalizeExtensions, type FileDialogItem } from "./utils";

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

/**
 * Resets everything tied to the directory currently on screen. Deliberately
 * leaves `data.selection` alone: picks made in other folders must survive
 * navigation. `lastSelected` is a per-listing row index, so shift-ranges never
 * span two directories.
 */
const resetView = () => {
  data.search = "";
  data.error = "";
  data.lastSelected = undefined;
};

const clearSelection = () => data.selection.clear();

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

  const depth = data.depth;

  if (data.currentLoadingPath === dirPath && data.currentLoadingDepth === depth) {
    return;
  }

  data.currentLoadingPath = dirPath;
  data.currentLoadingDepth = depth;

  getRawPlatformaInstance()
    .lsDriver.listFiles(storageHandle, dirPath, { depth })
    .then((res) => {
      if (dirPath !== data.dirPath || depth !== data.depth) {
        return;
      }

      // A host that predates ListFilesOps echoes no depth back. Learn that from
      // the first listing, so the control is never offered where it does nothing.
      data.depthSupported = res.depth !== undefined;
      if (!data.depthSupported && data.depth !== 1) data.depth = 1;

      data.truncated = res.truncated ?? false;
      data.unreadableDirs = res.unreadableDirs ?? 0;

      data.items = notEmpty(res)
        .entries.map((item) => ({
          path: item.fullPath,
          name: item.name,
          isDir: item.type === "dir",
          canBeSelected:
            item.type === "file" &&
            (!extensions.value || extensions.value.some((ext) => item.fullPath.endsWith(ext))),
          handle: item.type === "file" ? item.handle : undefined,
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
      data.currentLoadingDepth = undefined;
    });
};

const load = () => {
  resetView();
  const { storageHandle, dirPath, modelValue } = lookup.value;
  if (storageHandle && modelValue) {
    query(storageHandle, dirPath);
  }
};

const breadcrumbs = computed(() => getFilePathBreadcrumbs(data.dirPath));

const selectedCount = computed(() => data.selection.size);

const isSelected = (item: FileDialogItem) => data.selection.has(item.path);

const depthOptions: SimpleOption<number>[] = [
  { text: "This folder only", value: 1 },
  { text: "+ 1 level", value: 2 },
  { text: "+ 2 levels", value: 3 },
];

/**
 * What to print for a row. With a deeper listing, `name` alone is ambiguous —
 * every per-sample folder can hold an `R1.fastq.gz` — so nested rows are
 * labelled by their path below the folder being browsed. Done by prefix
 * stripping rather than by splitting, because remote storages do not guarantee
 * `/` as their separator.
 */
const rowLabel = (item: FileDialogItem) => {
  const base = data.dirPath;
  if (base && item.path.length > base.length && item.path.startsWith(base))
    return item.path.slice(base.length).replace(/^[/\\]+/, "");
  return item.name;
};

/**
 * A folder holding nothing but folders is the one-folder-per-sample case; offer
 * to pull their contents up instead of making the user descend one at a time.
 */
const deeperSuggestion = computed(() => {
  if (data.depth > 1 || data.depthSupported === false) return undefined;
  const items = visibleItems.value;
  if (items.length === 0 || items.some((it) => it.canBeSelected)) return undefined;
  const dirs = items.filter((it) => it.isDir).length;
  if (dirs === 0) return undefined;
  return `No files here. Show the files inside ${dirs === 1 ? "this folder" : `these ${dirs} folders`}`;
});

const isReady = computed(() => data.selection.size > 0 && data.storageEntry?.handle);

const getFilesToImport = () => ({
  storageHandle: notEmpty(data.storageEntry?.handle),
  files: [...data.selection.values()],
});

const setSelected = (item: FileDialogItem, selected: boolean) => {
  if (!item.canBeSelected || item.isDir || !item.handle) return;
  if (selected) data.selection.set(item.path, item.handle);
  else data.selection.delete(item.path);
};

const setDirPath = (dirPath: string) => {
  data.dirPath = dirPath;
};

const selectFile = (ev: MouseEvent, file: FileDialogItem) => {
  if (!file.canBeSelected) return;

  const { shiftKey } = ev;

  const ctrlOrMetaKey = isCtrlOrMeta(ev);

  const { lastSelected } = data;

  ev.preventDefault();

  const items = visibleItems.value;

  if (!props.multi) {
    clearSelection();
    setSelected(file, true);
    return;
  }

  // A plain click restarts the selection *within the directory on screen* and
  // leaves picks made in other folders in place — accumulating across folders
  // is the whole point. Use the header's Clear to drop everything.
  if (!ctrlOrMetaKey && !shiftKey) {
    items.forEach((f) => setSelected(f, false));
    setSelected(file, true);
    data.lastSelected = file.id;
    return;
  }

  if (shiftKey && lastSelected !== undefined) {
    items.forEach((f) => {
      if (between(f.id, lastSelected, file.id)) setSelected(f, true);
    });
    data.lastSelected = file.id;
    return;
  }

  const nowSelected = !isSelected(file);
  setSelected(file, nowSelected);
  if (nowSelected) data.lastSelected = file.id;
};

const changeAll = (selected: boolean) => {
  if (selected && !props.multi) {
    return;
  }

  visibleItems.value.forEach((file) => setSelected(file, selected));
};

/** Additive by design: descend, ⌘A, descend, ⌘A builds one selection. */
const selectAll = () => changeAll(true);

const deselectAll = () => changeAll(false);

const loadAvailableStorages = () => {
  resetView();
  clearSelection();
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
    resetView();
    // An import carries a single storage handle, so a selection cannot span
    // storages — drop it when the storage changes.
    clearSelection();
    // Back to one level: an unfamiliar tree should not be walked deeply on the
    // strength of a choice made for a different storage.
    data.depth = 1;
    data.dirPath = entry?.initialFullPath ?? "";
  },
  { immediate: true },
);

watch([() => data.dirPath, () => data.storageEntry, () => data.depth], () => {
  load();
});

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      loadAvailableStorages();
    } else {
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
  getFilesToImport,
});

onMounted(loadAvailableStorages);

const lsContainerRef = ref<HTMLElement | undefined>();
</script>

<template>
  <div :class="style.remote" @click.stop="deselectAll">
    <div :class="style.search">
      <div>
        <PlDropdown
          v-model="data.storageEntry"
          label="Select storage"
          :options="data.storageOptions"
        />
      </div>
      <div>
        <PlSearchField v-model="data.search" label="Search in folder" clearable />
      </div>
      <div v-if="data.depthSupported !== false" :class="style.depth">
        <PlDropdown v-model="data.depth" label="Include subfolders" :options="depthOptions" />
      </div>
    </div>
    <div :class="style['ls-container']" ref="lsContainerRef">
      <div :class="style['ls-head']">
        <div :class="style['breadcrumbs']">
          <template v-for="(s, i) in breadcrumbs" :key="i">
            <!-- .stop, like the directory rows: navigating must not reach the
                 container's deselect handler and drop this folder's picks. -->
            <div :title="s.path" @click.stop="setDirPath(s.path)">{{ s.name }}</div>
            <PlIcon16 v-if="s.index !== breadcrumbs.length - 1" name="chevron-right" />
          </template>
        </div>
        <!-- Same reason: reading the shortcuts tooltip is not a deselect. -->
        <div :class="style.selected" @click.stop>
          <span>Selected: {{ selectedCount }}</span>
          <span
            v-if="selectedCount > 0"
            :class="style.clear"
            title="Clear the selection in every folder"
            @click.stop="clearSelection"
            >Clear</span
          >
          <Shortcuts :container="lsContainerRef" />
        </div>
      </div>
      <div v-if="data.currentLoadingPath !== undefined" class="ls-loader">
        <i class="mask-24 mask-loading loader-icon" />
      </div>
      <div v-else-if="!data.storageEntry" :class="style['ls-empty']">
        <div :class="style.cat" />
        <div :class="style.message">Select storage to preview</div>
      </div>
      <div v-else-if="data.error" :class="style['ls-error']">
        <div :class="style.cat" />
        <div :class="style.message">{{ data.error }}</div>
      </div>
      <!-- Hints sit above the listing, never in place of it: a truncated
           listing still shows everything it did manage to read, and a folder of
           folders still shows those folders to descend into. -->
      <template v-else>
        <div v-if="deeperSuggestion" :class="style['ls-hint']">
          <span :class="style.action" @click.stop="data.depth = 2">{{ deeperSuggestion }}</span>
        </div>
        <div v-else-if="data.truncated" :class="style['ls-hint']">
          <span
            >Showing the first {{ data.items.length }} entries — this listing is incomplete.</span
          >
        </div>
        <div v-else-if="data.unreadableDirs > 0" :class="style['ls-hint']">
          <span>{{ data.unreadableDirs }} folder(s) could not be read, and were skipped.</span>
        </div>
        <div :class="style['ls-body']">
          <template v-for="file in visibleItems" :key="file.path">
            <!-- .stop matters: the container's click handler deselects, and
                 entering a folder must not drop what is already selected. -->
            <div v-if="file.isDir" :class="style.isDir" @click.stop="setDirPath(file.path)">
              <PlIcon16 name="chevron-right" />
              <span v-text-overflown :title="file.path">{{ rowLabel(file) }}</span>
            </div>
            <div
              v-else
              :class="{
                [style.canBeSelected]: file.canBeSelected,
                [style.selected]: isSelected(file),
              }"
              @click.stop="(ev) => selectFile(ev, file)"
            >
              <PlMaskIcon16 name="box" :class="style.isFile" />
              <span v-text-overflown :title="file.path">{{ rowLabel(file) }}</span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
