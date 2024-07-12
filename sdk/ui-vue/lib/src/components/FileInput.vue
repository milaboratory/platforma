<script lang="ts" setup>
import { BtnSecondary, MaskIcon } from '@milaboratory/platforma-uikit';

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

const props = withDefaults(
  defineProps<{
    modelValue: string;
    openFile: () => Promise<string | undefined>;
  }>(),
  {
    modelValue: '',
    openFile: () => {
      throw Error('Inject openFile implementation');
    },
  },
);

async function onDrop(e: DragEvent) {
  e.preventDefault();

  const paths = extractPaths(e);

  if (paths[0]) {
    emit('update:modelValue', paths[0]);
  }
}

function onClickSelect() {
  props.openFile().then((filePath) => {
    emit('update:modelValue', filePath);
  });
}

function clear() {
  emit('update:modelValue', undefined);
}
</script>

<template>
  <div class="file-input">
    <div v-if="modelValue" class="file-input__file">
      <mask-icon name="paper-clip" />
      <span>{{ modelValue }}</span>
      <mask-icon name="clear" @click.stop="clear" />
    </div>
    <div v-else class="file-input__select" @dragenter.prevent @dragover.prevent @drop="onDrop">
      Drag & drop CSV, TSV or XLS file here or
      <btn-secondary @click.stop="onClickSelect">Select file</btn-secondary>
    </div>
  </div>
</template>
