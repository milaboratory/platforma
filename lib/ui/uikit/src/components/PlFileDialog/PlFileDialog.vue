<script lang="ts" setup>
import style from './pl-file-dialog.module.scss';
import { ref, useTemplateRef } from 'vue';
import { listToOptions, notEmpty } from '@milaboratories/helpers';
import type { ImportedFiles } from '@/types';
import { PlDialogModal } from '../PlDialogModal';
import { PlBtnPrimary } from '../PlBtnPrimary';
import { PlBtnGhost } from '../PlBtnGhost';
import { PlBtnGroup } from '../PlBtnGroup';
import Remote from './Remote.vue';
import Local from './Local.vue';

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'import:files', value: ImportedFiles): void;
}>();

withDefaults(
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

const mode = ref<'local' | 'remote'>('local');

const closeModal = () => emit('update:modelValue', false);

const remoteRef = useTemplateRef('remote');

const submit = () => {
  if (remoteRef.value?.isReady) {
    emit('import:files', notEmpty(remoteRef.value?.getFilesToImport()));
    closeModal();
  }
};

const importFiles = (importedFiles: ImportedFiles) => {
  console.log('emitted value', importedFiles);
  emit('import:files', importedFiles);
  closeModal();
};
</script>

<template>
  <PlDialogModal
    :no-content-gutters="true"
    :close-on-outside-click="closeOnOutsideClick"
    class="pl-dialog-modal"
    :class="style.component"
    :model-value="modelValue"
    width="688px"
    height="720px"
    @update:model-value="closeModal"
  >
    <template #title>{{ title ?? 'Select files' }}</template>
    <div style="margin: 0 24px">
      <PlBtnGroup v-model="mode" :options="listToOptions(['local', 'remote'])" />
    </div>
    <Remote v-if="mode === 'remote'" ref="remote" v-bind="$props" :submit="submit" />
    <Local v-if="mode === 'local'" :import-files="importFiles" v-bind="$props" />
    <template v-if="mode === 'remote'" #actions>
      <PlBtnPrimary style="min-width: 160px" :disabled="!remoteRef?.isReady" @click.stop="submit">Import</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click.stop="closeModal">Cancel</PlBtnGhost>
    </template>
  </PlDialogModal>
</template>
