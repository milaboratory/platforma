<script setup lang="ts">
import style from './pl-file-dialog.module.scss';
import type { ImportedFiles } from '@/types';
import { PlIcon24 } from '../PlIcon24';
import { reactive } from 'vue';
import type { OpenDialogFilter } from '@platforma-sdk/model';

const props = defineProps<{
  importFiles: (value: ImportedFiles) => void;
  multi?: boolean;
  extensions?: string[];
}>();

const data = reactive({
  error: undefined as unknown,
});

const onDrop = async (ev: DragEvent) => {
  const fileToImportHandle = window.platforma?.lsDriver?.fileToImportHandle;

  if (!fileToImportHandle) {
    return console.error('API platforma.lsDriver.fileToImportHandle is not available');
  }

  const files = await Promise.all(
    [...(ev.dataTransfer?.files ?? [])]
      .filter((f) => !!f)
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
          extensions: props.extensions,
        },
      ]
    : [];

  if (props.multi) {
    window.platforma?.lsDriver
      .showOpenMultipleFilesDialog({
        title: 'Select file',
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
    window.platforma?.lsDriver
      .showOpenSingleFileDialog({
        title: 'Select file',
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
    <span>Drag & Drop file(s) here or click to add</span>
    <span v-if="extensions">Supported formats: {{ extensions.join(', ') }}</span>
    <span v-if="data.error" class="alert-error">{{ data.error }}</span>
  </div>
</template>
