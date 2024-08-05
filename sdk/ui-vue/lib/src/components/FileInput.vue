<script lang="ts" setup>
import { BtnSecondary, MaskIcon } from '@milaboratory/platforma-uikit';
import FileDialog from './FileDialog.vue';
import { computed, reactive } from 'vue';
import type { ImportedFiles } from '../types';
import type { ImportFileHandle } from '@milaboratory/sdk-ui';
import { getFilePathFromHandle } from '@milaboratory/sdk-ui';

const data = reactive({
  fileDialogOpen: false,
});

function extractFileName(filePath: string) {
  return filePath.replace(/^.*[\\/]/, '');
}

function extractExtension(filePath: string) {
  const parts = extractFileName(filePath).split('.');

  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  } else if (parts.length === 2) {
    return parts.slice(-1).join('.');
  }

  return '';
}

function extractPaths(e: DragEvent, extensions?: string[]) {
  const paths: string[] = [];

  if (e.dataTransfer) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      if (e.dataTransfer.items[i].kind !== 'file') {
        continue;
      }
      const file = e.dataTransfer.items[i].getAsFile() as (File & { path: string }) | null; // @TODO check
      if (file && file.path) {
        paths.push(file.path);
      }
    }
  }

  if (extensions) {
    return paths.filter((p) => extensions.includes(extractExtension(extractFileName(p))));
  }

  return paths;
}

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: string | undefined;
  extensions?: string[];
  fileDialogTitle?: string;
  placeholder?: string;
}>();

const fileName = computed(() => {
  if (props.modelValue) {
    try {
      return getFilePathFromHandle(props.modelValue as ImportFileHandle);
    } catch (e) {
      console.error(e);
      return props.modelValue;
    }
  }

  return '';
});

async function onDrop(e: DragEvent) {
  e.preventDefault();

  const paths = extractPaths(e);

  if (paths[0]) {
    emit('update:modelValue', paths[0]);
  }
}

const openFileDialog = () => {
  data.fileDialogOpen = true;
};

const onImport = (v: ImportedFiles) => {
  if (v.files.length) {
    emit('update:modelValue', v.files[0]);
  }
};

const clear = () => emit('update:modelValue', undefined);
</script>

<template>
  <div class="file-input">
    <div v-if="modelValue" class="file-input__file">
      <mask-icon name="paper-clip" />
      <span @click.stop="openFileDialog">{{ fileName }}</span>
      <mask-icon name="clear" @click.stop="clear" />
    </div>
    <div v-else class="file-input__select" @dragenter.prevent @dragover.prevent @drop="onDrop">
      {{ placeholder ?? 'Drag & drop file here or' }}
      <btn-secondary @click.stop="openFileDialog">Select file</btn-secondary>
    </div>
  </div>
  <file-dialog v-model="data.fileDialogOpen" :extensions="extensions" :title="fileDialogTitle" @import:files="onImport" />
</template>
