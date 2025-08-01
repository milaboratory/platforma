<script lang="ts" setup>
import { prettyBytes } from '@milaboratories/helpers';
import type { ImportFileHandle, ImportProgress } from '@platforma-sdk/model';
import { getFileNameFromHandle, getFilePathFromHandle } from '@platforma-sdk/model';
import { computed, reactive, ref, useSlots, watch } from 'vue';
import SvgRequired from '../../generated/components/svg/images/SvgRequired.vue';
import { getErrorMessage } from '../../helpers/error.ts';
import type { ImportedFiles } from '../../types';
import DoubleContour from '../../utils/DoubleContour.vue';
import { useLabelNotch } from '../../utils/useLabelNotch';
import { PlFileDialog } from '../PlFileDialog';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import { PlTooltip } from '../PlTooltip';
import './pl-file-input.scss';

const data = reactive({
  fileDialogOpen: false,
  error: undefined as undefined | string,
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
    error?: unknown;
    /**
     * A helper text to display below the input field when there are no errors.
     */
    helper?: string;
    /**
     * Remove rounded border and change styles
     */
    cellStyle?: boolean;
    /**
     * File dialog title
     */
    fileDialogTitle?: string;
    /**
     * If `true`, the file dialog window closes when clicking outside the modal area (default: `true`)
     */
    fileDialogCloseOnOutsideClick?: boolean;
  }>(),
  {
    label: undefined,
    extensions: undefined,
    fileDialogTitle: undefined,
    placeholder: undefined,
    progress: undefined,
    error: undefined,
    helper: undefined,
    cellStyle: false,
    fileDialogCloseOnOutsideClick: true,
  },
);

const tryValue = <T extends ImportFileHandle>(v: T | undefined, cb: (v: T) => string | undefined) => {
  if (!v) {
    return undefined;
  }

  try {
    return cb(v);
  } catch (err) {
    data.error = err instanceof Error ? err.message : String(err);
    return v;
  }
};

const fileName = computed(() => tryValue(props.modelValue, getFileNameFromHandle));

const filePath = computed(() => tryValue(props.modelValue, getFilePathFromHandle));

const isUploading = computed(() => props.progress && !props.progress.done);

const isUploaded = computed(() => props.progress && props.progress.done);

const computedErrorMessage = computed(() => getErrorMessage(data.error, props.error));

const hasErrors = computed(() => typeof computedErrorMessage.value === 'string');

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

watch(
  () => props.modelValue,
  () => (data.error = undefined),
  { immediate: true },
);

const rootRef = ref();

if (!props.cellStyle) {
  useLabelNotch(rootRef);
}
</script>

<template>
  <div :class="{ 'pl-file-input__cell-style': !!cellStyle, 'has-file': !!fileName }" class="pl-file-input__envelope">
    <div
      ref="rootRef"
      :class="{ dashed, error: hasErrors }"
      class="pl-file-input"
      tabindex="0"
      @keyup.enter="openFileDialog"
      @click.stop="openFileDialog"
    >
      <div :style="progressStyle" class="pl-file-input__progress" />
      <label v-if="!cellStyle && label" ref="label">
        <SvgRequired v-if="required" />
        <span>{{ label }}</span>
        <PlTooltip v-if="slots.tooltip || filePath" class="info" position="top">
          <template #tooltip>
            <slot v-if="slots.tooltip" name="tooltip" />
            <template v-else>{{ filePath }}</template>
          </template>
        </PlTooltip>
      </label>
      <PlMaskIcon24 v-if="hasErrors" name="restart" />
      <PlMaskIcon24 v-else-if="isUploading" name="cloud-upload" />
      <PlMaskIcon24 v-else-if="isUploaded" name="success" />
      <PlMaskIcon24 v-else name="paper-clip" />
      <div :data-placeholder="placeholder ?? 'Choose file'" class="pl-file-input__filename">
        {{ fileName }}
      </div>
      <div v-if="uploadStats" class="pl-file-input__stats">{{ uploadStats }}</div>
      <PlMaskIcon24 v-if="modelValue" class="pl-file-input__clear" name="close" @click.stop="clear" />
      <DoubleContour class="pl-file-input__contour" />
    </div>
    <div v-if="hasErrors" class="pl-file-input__error">
      {{ computedErrorMessage }}
    </div>
    <div v-else-if="helper" class="pl-file-input__helper">{{ helper }}</div>
  </div>
  <PlFileDialog
    v-model="data.fileDialogOpen"
    :close-on-outside-click="fileDialogCloseOnOutsideClick"
    :extensions="extensions"
    :title="fileDialogTitle"
    @import:files="onImport"
  />
</template>
