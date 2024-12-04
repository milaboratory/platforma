<script lang="ts" setup>
import { useEventListener } from '@/composition/useEventListener';
import type { ImportedFiles } from '@/types';
import { between, notEmpty, tapIf } from '@milaboratories/helpers';
import type { StorageHandle } from '@platforma-sdk/model';
import { computed, onMounted, reactive, toRef, watch } from 'vue';
import { PlDropdown } from '../PlDropdown';
import { PlIcon16 } from '../PlIcon16';
import { PlSearchField } from '../PlSearchField';
import style from './pl-file-dialog.module.scss';
import { defaultData, useVisibleItems, vTextOverflown } from './remote';
import { getFilePathBreadcrumbs, normalizeExtensions, type FileDialogItem } from './utils';

// note that on a Mac, a click combined with the control key is intercepted by the operating system and used to open a context menu, so ctrlKey is not detectable on click events.
const isCtrlOrMeta = (ev: KeyboardEvent | MouseEvent) => ev.ctrlKey || ev.metaKey;

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'import:files', value: ImportedFiles): void;
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
  data.search = '';
  data.error = '';
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
  if (!window.platforma) {
    return;
  }

  if (data.currentLoadingPath === dirPath) {
    return;
  }

  data.currentLoadingPath = dirPath;

  window.platforma.lsDriver
    .listFiles(storageHandle, dirPath)
    .then((res) => {
      if (dirPath !== data.dirPath) {
        return;
      }

      data.items = notEmpty(res)
        .entries.map((item) => ({
          path: item.fullPath,
          name: item.name,
          isDir: item.type === 'dir',
          canBeSelected: item.type === 'file' && (!extensions.value || extensions.value.some((ext) => item.fullPath.endsWith(ext))),
          handle: item.type === 'file' ? item.handle : undefined,
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

const selectedFiles = computed(() => data.items.filter((f) => f.canBeSelected && f.selected && !f.isDir));

const isReady = computed(() => selectedFiles.value.length > 0 && data.storageEntry?.handle);

const getFilesToImport = () => ({
  storageHandle: notEmpty(data.storageEntry?.handle),
  files: selectedFiles.value.map((f) => f.handle!),
});

const setDirPath = (dirPath: string) => {
  data.dirPath = dirPath;
};

const selectFile = (ev: MouseEvent, file: FileDialogItem) => {
  const { shiftKey } = ev;

  const ctrlOrMetaKey = isCtrlOrMeta(ev);

  const { lastSelected } = data;

  ev.preventDefault();

  if (file.canBeSelected) {
    if (!props.multi) {
      data.items.forEach((f) => (f.selected = false));
    }

    file.selected = true;

    if (!props.multi) {
      return;
    }

    if (!ctrlOrMetaKey && !shiftKey) {
      data.items.forEach((f) => {
        if (f.id !== file.id) {
          f.selected = false;
        }
      });
    }

    if (shiftKey && lastSelected !== undefined) {
      data.items.forEach((f) => {
        if (between(f.id, lastSelected, file.id)) {
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

  data.items
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
  if (!window.platforma) {
    console.warn('platforma API is not found');
    return;
  }
  window.platforma.lsDriver
    .getStorageList()
    .then((storageEntries) => {
      // local storage is always returned by the ML, so we need to remove it from remote dialog manually
      storageEntries = storageEntries.filter((it) => it.name !== 'local' && !it.name.startsWith('local_disk_'));

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
  toRef(data, 'storageEntry'),
  (entry) => {
    resetData();
    data.dirPath = entry?.initialFullPath ?? '';
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
      Object.assign(data, defaultData());
    }
  },
  { immediate: true },
);

useEventListener(document, 'keydown', (ev: KeyboardEvent) => {
  if (!props.modelValue) {
    return;
  }

  if (ev.target !== document.body) {
    return;
  }

  const ctrlOrMetaKey = isCtrlOrMeta(ev);

  if (ctrlOrMetaKey && ev.code === 'KeyA') {
    ev.preventDefault();
    selectAll();
  }

  if (ctrlOrMetaKey && ev.shiftKey && ev.code === 'Period') {
    ev.preventDefault();
    data.showHiddenItems = !data.showHiddenItems;
  }

  if (ev.code === 'Enter') {
    props.submit();
  }
});

defineExpose({
  isReady,
  getFilesToImport,
});

onMounted(loadAvailableStorages);
</script>

<template>
  <div :class="style.remote" @click.stop="deselectAll">
    <div :class="style.search">
      <div>
        <PlDropdown v-model="data.storageEntry" label="Select storage" :options="data.storageOptions" />
      </div>
      <div>
        <PlSearchField v-model="data.search" label="Search in folder" clearable />
      </div>
    </div>
    <div :class="style['ls-container']">
      <div :class="style['ls-head']">
        <div :class="style['breadcrumbs']">
          <template v-for="(s, i) in breadcrumbs" :key="i">
            <div :title="s.path" @click="setDirPath(s.path)">{{ s.name }}</div>
            <PlIcon16 v-if="s.index !== breadcrumbs.length - 1" name="chevron-right" />
          </template>
        </div>
        <div :class="style.selected">Selected: {{ selectedFiles.length }}</div>
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
      <div v-else :class="style['ls-body']">
        <template v-for="file in visibleItems" :key="file.id">
          <div v-if="file.isDir" :class="style.isDir" @click="setDirPath(file.path)">
            <i class="icon-16 icon-chevron-right" />
            <span v-text-overflown :title="file.name">{{ file.name }}</span>
          </div>
          <div
            v-else
            :class="{ [style.canBeSelected]: file.canBeSelected, [style.selected]: file.selected }"
            @click.stop="(ev) => selectFile(ev, file)"
          >
            <i class="mask-16 mask-box" :class="style.isFile" />
            <span v-text-overflown :title="file.name">{{ file.name }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
