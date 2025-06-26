<script setup lang="ts">
import type { AnnotationScriptUi, AnnotationMode, AnnotationScript } from '@platforma-sdk/model';
import type { SimplifiedUniversalPColumnEntry } from './types';
import { computed } from 'vue';
import {
  PlSlideModal,
  PlBtnGroup,
  PlBtnSecondary,
  PlIcon16,
  type SimpleOption,
  PlEditableTitle,
} from '@platforma-sdk/ui-vue';
import { compileAnnotationScript } from '@platforma-sdk/model';

import { getDefaultAnnotationScript } from './getDefaultAnnotationScript';
import { watchDebounced, useEventListener } from '@vueuse/core';
import { provideAnnotationsState } from './AnnotationsState';
import StepsList from './StepsList.vue';

const ui = defineModel<AnnotationScriptUi>('ui', { required: true });
const args = defineModel<AnnotationScript>('args', { required: true });
const opened = defineModel<boolean>('opened', { required: true });

const props = defineProps<{ columns?: SimplifiedUniversalPColumnEntry[] }>();

const state = provideAnnotationsState({
  columns: props.columns,
});

const form = computed({
  get: () => ui.value ?? getDefaultAnnotationScript(),
  set: (value) => (ui.value = value),
});

// useSyncUiToArgs
watchDebounced(form.value, (value, oldValue) => {
  if (value && (value === oldValue)) { // same ref
    try {
      // useless operation in theory
      args.value = compileAnnotationScript(value);
    } catch (e) {
      console.error(e);
    }
  }
}, { deep: true, debounce: 2000 });

const addStep = () => {
  if (!form.value) {
    return;
  }

  form.value.steps.push({
    label: `Label #${form.value.steps.length + 1}`,
    filter: {
      type: 'and',
      filters: [],
    },
  });

  state.value.editStepModalIndex = form.value.steps.length - 1;
};

const removeStep = (index: number) => {
  if (!form.value) {
    return;
  }
  form.value.steps = form.value.steps.filter((_, i) => i !== index);
};

const reorderSteps = (indices: number[]) => {
  if (!form.value) {
    return;
  }

  form.value.steps = indices.map((i) => form.value!.steps[i]);
};

const groupOptions = [
  { label: 'Global', value: 'byClonotype' },
  { label: 'Per sample', value: 'bySampleAndClonotype' },
] satisfies SimpleOption<AnnotationMode>[];

useEventListener(document.body, 'click', (ev) => {
  const target = ev.target as HTMLElement;

  if (target.closest('.pl-slide-modal') || target.closest('.pl-app-notification-alert')) {
    return;
  }

  if (state.value.editStepModalIndex !== undefined) {
    state.value.editStepModalIndex = undefined;
  } else if (state.value.addFilterModalIndex !== undefined) {
    state.value.addFilterModalIndex = undefined;
  } else {
    opened.value = false;
  }
});
</script>

<template>
  <PlSlideModal ref="modal" v-model="opened" :close-on-outside-click="false">
    <template #title>
      <PlEditableTitle
        v-model="form.title"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Name"
      />
    </template>
    <template v-if="form">
      <PlBtnGroup v-model="form.mode" :options="groupOptions" />
      <div :class="$style.steps">
        <StepsList :key="form.steps.length" :steps="form.steps" @delete="removeStep" @reorder="reorderSteps" />
        <PlBtnSecondary :class="$style.addStepBtn" @click="addStep">
          <PlIcon16 name="add" style="margin-right: 8px;" />
          Add annotation
        </PlBtnSecondary>
      </div>
    </template>
  </PlSlideModal>
</template>

<style module>
.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.addStepBtn {
  border: 1px dashed #E1E3EB;
}
</style>
