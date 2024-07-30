<script lang="ts" setup>
import { watch, reactive, computed, toRef, watchEffect, onUpdated } from 'vue';
import { BtnPrimary, BtnGhost, TextField, SelectInput, DialogModal } from '@milaboratory/platforma-uikit';
import { debounce } from '@milaboratory/helpers/functions';
import { between, notEmpty, tapIf } from '@milaboratory/helpers/utils';
import type { Option } from '@milaboratory/helpers/types';
import type { ImportFileHandle, StorageHandle } from '@milaboratory/sdk-ui';
import type { ImportedFiles } from '../types';

type LsFile = {
  id: number;
  path: string;
  isAllowed: boolean;
  isDir: boolean;
  selected: boolean;
  handle: ImportFileHandle | undefined;
};

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'import:files', value: ImportedFiles): void;
}>();

// example extensions = ['.fastq.gz', '.fastq'];
const props = defineProps<{
  modelValue: boolean;
  extensions?: string[];
  multi?: boolean;
  title?: string;
}>();

const vFocus = {
  mounted: (el: HTMLElement) => {
    (el.querySelector('button.ui-btn-primary') as HTMLButtonElement | null)?.focus();
  },
};

const data = reactive({
  dirPath: '',
  storageHandle: undefined as StorageHandle | undefined,
  files: [] as LsFile[],
  error: '',
  storageOptions: [] as Option<StorageHandle>[],
  selected: [],
  lastSelected: undefined as number | undefined,
});

const lookup = computed(() => {
  return {
    dirPath: data.dirPath,
    storageHandle: data.storageHandle,
  };
});

watch(toRef(data, 'storageHandle'), () => {
  data.dirPath = '';
});

const query = debounce((storageHandle: StorageHandle, dirPath: string) => {
  data.error = '';
  data.files = [];
  data.lastSelected = undefined;
  if (!window.platforma) {
    return;
  }
  window.platforma.lsDriver
    .listFiles(storageHandle, dirPath)
    .then((res) => {
      res = notEmpty(res);
      data.files = res.entries.map((item, id) => ({
        id,
        path: item.fullPath,
        isDir: item.type === 'dir',
        isAllowed: item.type === 'file' && (!props.extensions || props.extensions.some((ext) => item.fullPath.endsWith(ext))),
        handle: item.type === 'file' ? item.handle : undefined,
        selected: false,
      }));
    })
    .catch((err) => (data.error = String(err)));
}, 1000);

watchEffect(() => {
  const { storageHandle, dirPath } = lookup.value;
  if (storageHandle) {
    query(storageHandle, dirPath);
  }
});

const selectedFiles = computed(() => data.files.filter((f) => f.isAllowed && f.selected && !f.isDir));

const isReady = computed(() => selectedFiles.value.length > 0);

const closeModal = () => {
  emit('update:modelValue', false);
};

const submit = () => {
  if (isReady.value && data.storageHandle) {
    emit('import:files', {
      storageHandle: data.storageHandle,
      files: selectedFiles.value.map((f) => f.handle!),
    });
    closeModal();
  }
};

const selectFile = (ev: MouseEvent, file: LsFile) => {
  const { shiftKey, metaKey } = ev;
  const { lastSelected } = data;
  ev.preventDefault();

  if (file.isDir) {
    data.dirPath = file.path;
    data.files = [];
  }

  if (file.isAllowed) {
    if (!props.multi) {
      data.files.forEach((f) => (f.selected = false));
    }

    file.selected = true;

    if (!props.multi) {
      return;
    }

    if (!metaKey && !shiftKey) {
      data.files.forEach((f) => {
        if (f.id !== file.id) {
          f.selected = false;
        }
      });
    }

    if (shiftKey && lastSelected !== undefined) {
      data.files.forEach((f) => {
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

const changeAll = (s: boolean) =>
  data.files.forEach((file) => {
    if (file.isAllowed) {
      file.selected = s;
    }
  });

const refresh = () => {
  data.error = '';
  data.lastSelected = undefined;
  changeAll(false);
  if (!window.platforma) {
    return;
  }
  window.platforma.lsDriver
    .getStorageList()
    .then((storageEntries) => {
      data.storageOptions = storageEntries.map((it) => ({
        text: it.name,
        value: it.handle,
      }));

      tapIf(
        storageEntries.find((e) => e.name === 'local'),
        (entry) => {
          data.storageHandle = entry.handle;
          data.dirPath = entry.initialFullPath;
        },
      );
    })
    .catch((err) => (data.error = String(err)));
};

watch(
  () => props.modelValue,
  () => refresh(),
  { immediate: true },
);

onUpdated(refresh);
</script>

<template>
  <dialog-modal class="split" :model-value="modelValue" width="688px" @update:model-value="closeModal">
    <div v-focus class="form-modal" @click.stop @keyup.enter="submit">
      <div class="form-modal__title">{{ title ?? 'Select files' }}</div>
      <select-input v-model="data.storageHandle" label="Select storage" :options="data.storageOptions" />
      <text-field v-model="data.dirPath" label="Enter path" />
      <div class="d-flex column">
        <div v-if="data.files.length" class="ls-head">
          <span>Selected: {{ selectedFiles.length }}</span>
          <div v-if="multi" class="ml-auto" @click.stop="() => changeAll(true)">Select all</div>
          <span>/</span>
          <div @click.stop="() => changeAll(false)">Deselect all</div>
        </div>
        <div v-if="data.files.length" class="ls-container">
          <div
            v-for="file in data.files"
            :key="file.id"
            :class="{ isAllowed: file.isAllowed, isDir: file.isDir, selected: file.selected }"
            @click="(ev) => selectFile(ev, file)"
          >
            {{ file.path }}
          </div>
        </div>
      </div>
      <div v-if="data.error" class="alert-error">{{ data.error }}</div>
    </div>
    <div class="form-modal__actions bordered">
      <btn-primary :disabled="!isReady" @click.stop="submit">Import</btn-primary>
      <btn-ghost :justify-center="false" @click.stop="closeModal">Cancel</btn-ghost>
    </div>
  </dialog-modal>
</template>
