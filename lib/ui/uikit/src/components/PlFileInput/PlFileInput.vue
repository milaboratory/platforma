<script lang="ts" setup>
import './pl-file-input.scss';
import { PlTooltip } from '@/components/PlTooltip';
import { PlFileDialog } from '@/components/PlFileDialog';
import type { ImportedFiles } from '@/types';
import { PlMaskIcon24 } from '../PlMaskIcon24';
import { computed, reactive, ref, useSlots, watch } from 'vue';
import type { ImportFileHandle, ImportProgress } from '@platforma-sdk/model';
import { getFileNameFromHandle, getFilePathFromHandle } from '@platforma-sdk/model';
import DoubleContour from '@/utils/DoubleContour.vue';
import { useLabelNotch } from '@/utils/useLabelNotch';
import { isErrorLike, prettyBytes, tryDo } from '@milaboratories/helpers';

const data = reactive({
  fileDialogOpen: false,
  error: '',
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

const computedError = computed(() => {
  let message: undefined | string = undefined;

  if (data.error.length > 0) {
    message = data.error;
  } else if (typeof props.error === 'string') {
    message = props.error;
  } else if (isErrorLike(props.error)) {
    message = props.error.message;
  } else if (props.error != null) {
    const unknownString = tryDo(() => JSON.stringify(props.error, null, 4), () => String(props.error));
    message = `Unknown error type:\n${unknownString}`;
  }

  if (typeof message === 'string' && message.length === 0) {
    message = 'Empty error';
  }

  return message;
});

const hasErrors = computed(() => typeof computedError.value === 'string' && computedError.value.length > 0);

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
  () => {
    data.error = '';
  },
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
        <i v-if="required" class="required-icon" />
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
      <PlMaskIcon24 v-if="modelValue" name="close" @click.stop="clear" />
      <DoubleContour class="pl-file-input__contour" />
    </div>
    <div v-if="hasErrors" class="pl-file-input__error">
      {{ computedError }}
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
