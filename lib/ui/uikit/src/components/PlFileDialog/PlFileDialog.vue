<script lang="ts" setup>
import style from './pl-file-dialog.module.scss';
import { computed, ref, useTemplateRef } from 'vue';
import { notEmpty } from '@milaboratories/helpers';
import type { ImportedFiles, SimpleOption } from '@/types';
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

const props = withDefaults(
  defineProps<{
    /**
     * Controls the visibility of the modal.
     *
     * When `true`, the modal is open. When `false`, the modal is closed.
     */
    modelValue: boolean;
    /**
     * Specifies the file extensions that are allowed for selection.
     *
     * Provide an array of strings representing file extensions (leading dot can be omitted)
     * If not specified, all file types are allowed.
     */
    extensions?: string[];
    /**
     * Enables the selection of multiple files.
     *
     * When `true`, the user can select multiple files.
     * When `false` or not specified, only a single file can be selected.
     */
    multi?: boolean;
    /**
     * The custom title of the dialog.
     */
    title?: string;
    /**
     * Automatically selects the initial storage option.
     * When `true`, the default storage is pre-selected for the user (default: `true`)
     */
    autoSelectStorage?: boolean;
    /**
     * If `true`, the modal window closes when clicking outside the modal area (default: `true`)
     */
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

const defaultTitle = computed(() => (props.multi ? 'Select Files to Import' : 'Select File to Import'));

const modeOptions = [
  {
    label: 'My Computer',
    value: 'local',
  },
  {
    label: 'Remote',
    value: 'remote',
  },
] satisfies SimpleOption[];

const closeModal = () => emit('update:modelValue', false);

const remoteRef = useTemplateRef('remote');

const submit = () => {
  if (remoteRef.value?.isReady) {
    emit('import:files', notEmpty(remoteRef.value?.getFilesToImport()));
    closeModal();
  }
};

const importFiles = (importedFiles: ImportedFiles) => {
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
    <template #title>{{ title ?? defaultTitle }}</template>
    <div style="margin: 0 24px">
      <PlBtnGroup v-model="mode" :options="modeOptions" />
    </div>
    <Remote v-if="mode === 'remote'" ref="remote" v-bind="$props" :submit="submit" />
    <Local v-if="mode === 'local'" :import-files="importFiles" v-bind="$props" />
    <template v-if="mode === 'remote'" #actions>
      <PlBtnPrimary style="min-width: 160px" :disabled="!remoteRef?.isReady" @click.stop="submit">Import</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click.stop="closeModal">Cancel</PlBtnGhost>
    </template>
  </PlDialogModal>
</template>
