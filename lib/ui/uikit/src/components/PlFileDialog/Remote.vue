<script lang="ts" setup>
import { useEventListener } from "../../composition/useEventListener";
import type { ImportedFiles } from "../../types";
import { between, notEmpty, tapIf } from "@milaboratories/helpers";
import { getRawPlatformaInstance, type StorageHandle } from "@platforma-sdk/model";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRef, watch } from "vue";
import { PlDropdown } from "../PlDropdown";
import { PlIcon16 } from "../PlIcon16";
import Shortcuts from "./Shortcuts.vue";
import { PlMaskIcon16 } from "../PlMaskIcon16";
import { PlSearchField } from "../PlSearchField";
import style from "./pl-file-dialog.module.scss";
import { defaultData, useVisibleItems, vTextOverflown } from "./remote-helpers";
import { getFilePathBreadcrumbs, normalizeExtensions, type FileDialogItem } from "./utils";
import { expandRemoteFolders, type ExpandProgress } from "./remote-folder-walk";

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

const selectedLabel = computed(() => {
  const files = selectedFiles.value.length;
  const folders = selectedFolders.value.length;
  if (folders === 0) return `Selected: ${files}`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `Selected: ${plural(files, "file")}, ${plural(folders, "folder")}`;
});

/** Set while selected folders are being expanded into files. */
const importing = shallowRef<{ controller: AbortController; progress: ExpandProgress }>();
const importError = shallowRef<string>();

const isReady = computed(
  () =>
    selectedFiles.value.length + selectedFolders.value.length > 0 &&
    !!data.storageEntry?.handle &&
    !importing.value,
);

const isImporting = computed(() => !!importing.value);

const progressLabel = computed(() => {
  const p = importing.value?.progress;
  return p ? `Collecting files… ${p.foldersListed} folders read, ${p.filesFound} files found` : "";
});

/**
 * The files to import, with selected folders expanded. `undefined` when the import is
 * cancelled, fails, or a selected folder holds nothing to import; the reason is shown.
 */
const getFilesToImport = async (): Promise<ImportedFiles | undefined> => {
  const storageHandle = notEmpty(data.storageEntry?.handle);
  const files = selectedFiles.value.flatMap((f) => (f.handle ? [f.handle] : []));
  const folders = selectedFolders.value.map((f) => f.path);
  if (folders.length === 0) return { storageHandle, files };

  const controller = new AbortController();
  importing.value = { controller, progress: { foldersListed: 0, filesFound: 0 } };
  importError.value = undefined;
  try {
    const expanded = await expandRemoteFolders(
      (storage, path) => getRawPlatformaInstance().lsDriver.listFiles(storage, path),
      storageHandle,
      folders,
      {
        extensions: extensions.value,
        signal: controller.signal,
        onProgress: (progress) => (importing.value = { controller, progress }),
      },
    );
    if (expanded.emptyFolders.length > 0) {
      const names = expanded.emptyFolders.map((p) => p.split("/").filter(Boolean).at(-1) ?? p);
      const what = props.extensions
        ? `files with supported formats (${props.extensions.join(", ")})`
        : "files";
      importError.value = `No ${what} in: ${names.join(", ")}. Deselect to import the rest.`;
      return undefined;
    }
    return { storageHandle, files: [...files, ...expanded.handles] };
  } catch (err) {
    if (!controller.signal.aborted) importError.value = String(err);
    return undefined;
  } finally {
    importing.value = undefined;
  }
};

const cancelImport = () => importing.value?.controller.abort();

onBeforeUnmount(cancelImport);

const setDirPath = (dirPath: string) => {
  importError.value = undefined;
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
      importError.value = undefined;
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
      <div v-if="importing" :class="$style.status" data-testid="pl-file-dialog-import-progress">
        {{ progressLabel }}
      </div>
      <div
        v-else-if="importError"
        :class="[$style.status, 'alert-error']"
        data-testid="pl-file-dialog-import-error"
      >
        {{ importError }}
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
