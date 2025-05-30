<script setup lang="ts">
import style from './pl-file-dialog.module.scss';
import type { ImportedFiles } from '@/types';
import { PlIcon24 } from '../PlIcon24';
import { computed, reactive } from 'vue';
import { getRawPlatformaInstance, type OpenDialogFilter } from '@platforma-sdk/model';
import { normalizeExtensions } from './utils';

const props = defineProps<{
  importFiles: (value: ImportedFiles) => void;
  multi?: boolean;
  extensions?: string[];
}>();

const data = reactive({
  error: undefined as unknown,
});

const label = computed(() => (props.multi ? 'Drag & Drop files here or click to add' : 'Drag & Drop file here or click to add'));

const onDrop = async (ev: DragEvent) => {
  const fileToImportHandle = getRawPlatformaInstance()?.lsDriver?.fileToImportHandle;

  if (!fileToImportHandle) {
    return console.error('API getPlatformaRawInstance().lsDriver.fileToImportHandle is not available');
  }

  const extensions = normalizeExtensions(props.extensions);

  const files = await Promise.all(
    [...(ev.dataTransfer?.files ?? [])]
      .filter((f) => !!f)
      .filter((f) => (extensions ? extensions.some((ext) => f.name.endsWith(ext)) : true))
      .map((file) => {
        return fileToImportHandle(file);
      }),
  );

  if (files.length) {
    props.importFiles({
      files,
    });
  }
};

const openNativeDialog = async () => {
  const filters: OpenDialogFilter[] = props.extensions
    ? [
        {
          name: 'All Files',
          extensions: [...props.extensions],
        },
      ]
    : [];

  if (props.multi) {
    getRawPlatformaInstance()?.lsDriver
      .showOpenMultipleFilesDialog({
        title: 'Select files to import',
        filters,
      })
      .then(({ files }) => {
        if (files) {
          props.importFiles({
            files,
          });
        }
      })
      .catch((err) => (data.error = err));
  } else {
    getRawPlatformaInstance()?.lsDriver
      .showOpenSingleFileDialog({
        title: 'Select file to import',
        filters,
      })
      .then(({ file }) => {
        if (file) {
          props.importFiles({
            files: [file],
          });
        }
      })
      .catch((err) => (data.error = err));
  }
};
</script>

<template>
  <div :class="style.local" @drop="onDrop" @dragover.prevent @click="openNativeDialog">
    <PlIcon24 name="cloud-upload" />
    <span>{{ label }}</span>
    <span v-if="extensions" :class="style.supported">Supported formats: {{ extensions.join(', ') }}</span>
    <span v-if="data.error" class="alert-error">{{ data.error }}</span>
  </div>
</template>
