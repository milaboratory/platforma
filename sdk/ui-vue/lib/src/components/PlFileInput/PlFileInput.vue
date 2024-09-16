<script lang="ts" setup>
import './pl-file-input.scss';
import { MaskIcon24, PlTooltip } from '@milaboratory/platforma-uikit';
import { computed, reactive, ref, useSlots } from 'vue';
import type { ImportedFiles } from '../../types';
import type { ImportFileHandle, ImportProgress } from '@milaboratory/sdk-ui';
import { getFilePathFromHandle } from '@milaboratory/sdk-ui';
import FileDialog from '../FileDialog.vue';
import DoubleContour from './DoubleContour.vue';
import { useLabelNotch } from '@milaboratory/platforma-uikit';
import { prettyBytes } from '@milaboratory/helpers';
import { extractFileName } from './utils';

const data = reactive({
  fileDialogOpen: false,
});

const slots = useSlots();

const emit = defineEmits<{
  (e: 'update:modelValue', value: ImportFileHandle | undefined): void;
}>();

const props = withDefaults(
  defineProps<{
    /**
     * The current import file handle.
     */
    modelValue: ImportFileHandle | undefined;
    /**
     * The label to display above the input field.
     */
    label?: string;
    /**
     * If `true`, the input field is marked as required.
     */
    required?: boolean;
    /**
     * If `true`, the component border is dashed.
     */
    dashed?: boolean;
    /**
     * Allowed file extensions (should start with `.`)
     */
    extensions?: string[];
    /**
     * File dialog title
     */
    fileDialogTitle?: string;
    /**
     * Placeholder text
     */
    placeholder?: string;
    /**
     * Import/Upload progress
     */
    progress?: ImportProgress;
    /**
     * An error message to display below the input field.
     */
    error?: string;
    /**
     * A helper text to display below the input field when there are no errors.
     */
    helper?: string;
    /**
     * If `true`, only the file name is displayed, not the full path to it.
     */
    showFilenameOnly?: boolean;
  }>(),
  {
    label: undefined,
    extensions: undefined,
    fileDialogTitle: undefined,
    placeholder: undefined,
    progress: undefined,
    error: undefined,
    helper: undefined,
  },
);

const fileName = computed(() => {
  if (props.modelValue) {
    try {
      const filePath = getFilePathFromHandle(props.modelValue as ImportFileHandle).trim();
      return props.showFilenameOnly ? extractFileName(filePath) : filePath;
    } catch (e) {
      console.error(e);
      return props.modelValue;
    }
  }

  return '';
});

const isUploading = computed(() => props.progress && !props.progress.done);

const isUploaded = computed(() => props.progress && props.progress.done);

const hasErrors = computed(() => props.error || props.progress?.lastError);

const computedError = computed(() => props.error ?? props.progress?.lastError);

const uploadStats = computed(() => {
  const { status, done } = props.progress ?? {};

  if (!status || !status.bytesTotal) {
    return '';
  }

  if (status.bytesProcessed && !done) {
    return prettyBytes(status.bytesProcessed, {}) + ' / ' + prettyBytes(status.bytesTotal, {});
  }

  return prettyBytes(status.bytesTotal, {});
});

const progressStyle = computed(() => {
  const { progress } = props;

  if (!progress) {
    return {};
  }

  return {
    width: progress.done ? '100%' : Math.round((progress.status?.progress ?? 0) * 100) + '%',
  };
});

const openFileDialog = () => {
  data.fileDialogOpen = true;
};

const onImport = (v: ImportedFiles) => {
  if (v.files.length) {
    emit('update:modelValue', v.files[0]);
  }
};

const clear = () => emit('update:modelValue', undefined);

const rootRef = ref();

useLabelNotch(rootRef);
</script>

<template>
  <div class="pl-file-input__envelope">
    <div ref="rootRef" class="pl-file-input" :class="{ dashed, error: hasErrors }">
      <div class="pl-file-input__progress" :style="progressStyle" />
      <label v-if="label" ref="label">
        <i v-if="required" class="required-icon" />
        <span>{{ label }}</span>
        <PlTooltip v-if="slots.tooltip" class="info" position="top">
          <template #tooltip>
            <slot name="tooltip" />
          </template>
        </PlTooltip>
      </label>
      <MaskIcon24 v-if="hasErrors" name="restart" />
      <MaskIcon24 v-else-if="isUploading" name="cloud-up" />
      <MaskIcon24 v-else-if="isUploaded" name="success" />
      <MaskIcon24 v-else name="paper-clip" />
      <div :data-placeholder="placeholder ?? 'Choose file'" class="pl-file-input__filename" @click.stop="openFileDialog">
        {{ fileName }}
      </div>
      <div v-if="uploadStats" class="pl-file-input__stats">{{ uploadStats }}</div>
      <MaskIcon24 v-if="modelValue" name="close" @click.stop="clear" />
      <DoubleContour class="pl-file-input__contour" />
    </div>
    <div v-if="hasErrors" class="pl-file-input__error">
      {{ computedError }}
    </div>
    <div v-else-if="helper" class="upl-file-input__helper">{{ helper }}</div>
  </div>
  <FileDialog v-model="data.fileDialogOpen" :extensions="extensions" :title="fileDialogTitle" @import:files="onImport" />
</template>
