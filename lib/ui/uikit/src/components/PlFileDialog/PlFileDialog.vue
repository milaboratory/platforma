<script lang="ts" setup>
import './pl-file-dialog.scss';
import { watch, reactive, computed, toRef, onUpdated } from 'vue';
import { between, notEmpty, tapIf } from '@milaboratories/helpers';
import type { Option } from '@milaboratories/helpers';
import type { StorageEntry, StorageHandle } from '@platforma-sdk/model';
import type { ImportedFiles } from '@/types';
import { getFilePathBreadcrumbs, type FileDialogItem } from './utils';
import { PlTextField } from '../PlTextField';
import { PlDialogModal } from '../PlDialogModal';
import { PlDropdown } from '../PlDropdown';
import { PlBtnPrimary } from '../PlBtnPrimary';
import { PlBtnGhost } from '../PlBtnGhost';
import { useEventListener } from '@/composition/useEventListener';

const emit = defineEmits<{
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
    closeOnOutsideClick?: boolean;
  }>(),
  {
    extensions: undefined,
    title: undefined,
    autoSelectStorage: true,
    closeOnOutsideClick: true,
  },
);

const defaultData = () => ({
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

const data = reactive(defaultData());

const resetData = () => {
  data.search = '';
  data.error = '';
  data.lastSelected = undefined;
};

const visibleItems = computed(() => {
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

const lookup = computed(() => {
  return {
    modelValue: props.modelValue,
    dirPath: data.dirPath,
    storageHandle: data.storageEntry?.handle,
  };
});

const query = (handle: StorageHandle, dirPath: string) => {
  if (!window.platforma) {
    return;
  }

  if (data.currentLoadingPath === dirPath) {
    return;
  }

  data.currentLoadingPath = dirPath;

  window.platforma.lsDriver
    .listFiles(handle, dirPath)
    .then((res) => {
      if (dirPath !== data.dirPath) {
        return;
      }

      data.items = notEmpty(res)
        .entries.map((item) => ({
          path: item.fullPath,
          name: item.name,
          isDir: item.type === 'dir',
          canBeSelected: item.type === 'file' && (!props.extensions || props.extensions.some((ext) => item.fullPath.endsWith(ext))),
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

const isReady = computed(() => selectedFiles.value.length > 0);

const closeModal = () => {
  emit('update:modelValue', false);
};

const submit = () => {
  if (isReady.value && data.storageEntry?.handle) {
    emit('import:files', {
      storageHandle: data.storageEntry.handle,
      files: selectedFiles.value.map((f) => f.handle!),
    });
    closeModal();
  }
};

const setDirPath = (dirPath: string) => {
  data.dirPath = dirPath;
};

const selectFile = (ev: MouseEvent, file: FileDialogItem) => {
  const { shiftKey, metaKey } = ev;
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

    if (!metaKey && !shiftKey) {
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
      data.storageOptions = storageEntries.map((it) => ({
        text: it.name,
        value: it,
      }));

      if (props.autoSelectStorage) {
        tapIf(
          storageEntries.find(
            (e) =>
              e.name === 'local' || // the only local storage on unix systems
              (e.name.startsWith('local_disk_') && e.initialFullPath.length > 4),
          ), // local drive where home folder is stored, normally C:\
          (entry) => {
            data.storageEntry = entry;
          },
        );
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

  if (ev.metaKey && ev.code === 'KeyA') {
    ev.preventDefault();
    selectAll();
  }

  if (ev.metaKey && ev.shiftKey && ev.code === 'Period') {
    ev.preventDefault();
    data.showHiddenItems = !data.showHiddenItems;
  }

  if (ev.code === 'Enter') {
    submit();
  }
});

onUpdated(loadAvailableStorages);

const vTextOverflown = {
  mounted: (el: HTMLElement) => {
    if (el.clientWidth < el.scrollWidth) {
      const s = el.innerText;
      el.innerText = s.substring(0, 57) + '...' + s.substring(s.length - 10);
    }
  },
};
</script>

<template>
  <PlDialogModal
    :no-content-gutters="true"
    :close-on-outside-click="closeOnOutsideClick"
    class="split"
    :model-value="modelValue"
    width="688px"
    height="720px"
    @update:model-value="closeModal"
    @click.stop="deselectAll"
  >
    <template #title>{{ title ?? 'Select files' }}</template>
    <div class="file-dialog">
      <div class="file-dialog__search">
        <PlDropdown v-model="data.storageEntry" label="Select storage" :options="data.storageOptions" />
        <PlTextField v-model="data.search" label="Search in folder" :clearable="() => ''" />
      </div>
      <div class="ls-container">
        <div class="ls-head">
          <div class="ls-head__breadcrumbs">
            <template v-for="(s, i) in breadcrumbs" :key="i">
              <div :title="s.path" @click="setDirPath(s.path)">{{ s.name }}</div>
              <i v-if="s.index !== breadcrumbs.length - 1" class="icon-16 icon-chevron-right" />
            </template>
          </div>
          <div class="d-flex ml-auto align-center gap-12">
            <span class="ls-head__selected">Selected: {{ selectedFiles.length }}</span>
          </div>
        </div>
        <div v-if="data.currentLoadingPath !== undefined" class="ls-loader">
          <i class="mask-24 mask-loading loader-icon" />
        </div>
        <div v-else-if="!data.storageEntry" class="ls-empty">
          <div class="ls-empty__cat" />
          <div class="ls-empty__message">Select storage to preview</div>
        </div>
        <div v-else-if="data.error" class="ls-error">
          <div class="ls-error__cat" />
          <div class="ls-error__message">{{ data.error }}</div>
        </div>
        <div v-else class="ls-body">
          <template v-for="file in visibleItems" :key="file.id">
            <div v-if="file.isDir" class="isDir" @click="setDirPath(file.path)">
              <i class="icon-16 icon-chevron-right" />
              <span v-text-overflown :title="file.name">{{ file.name }}</span>
            </div>
            <div v-else :class="{ canBeSelected: file.canBeSelected, selected: file.selected }" @click.stop="(ev) => selectFile(ev, file)">
              <i class="mask-16 mask-box isFile" />
              <span v-text-overflown :title="file.name">{{ file.name }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
    <template #actions>
      <PlBtnPrimary style="min-width: 160px" :disabled="!isReady" @click.stop="submit">Import</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click.stop="closeModal">Cancel</PlBtnGhost>
    </template>
  </PlDialogModal>
</template>
