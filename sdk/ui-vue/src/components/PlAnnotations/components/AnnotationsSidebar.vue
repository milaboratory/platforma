<script setup lang="ts">
import type { AnnotationScriptUi, AnnotationMode } from '@platforma-sdk/model';
import { randomInt } from '@milaboratories/helpers';
import {
  PlBtnGroup,
  PlBtnSecondary,
  type SimpleOption,
  PlEditableTitle,
  PlSidebarItem,
  PlBtnGhost,
  PlElementList,
} from '@milaboratories/uikit';

// Models
const annotation = defineModel<AnnotationScriptUi>('annotation', { required: true });
const selectedStepId = defineModel<undefined | number>('selectedStepId');
// Actions
const addStep = () => {
  const id = randomInt();
  annotation.value.steps.push({
    id,
    label: '',
    filter: {
      type: 'and',
      filters: [],
    },
  });
  selectedStepId.value = id;
};

const updateAnnotationMode = async (mode: AnnotationMode) => {
  if (await window.confirm('Changing the annotation mode will reset the current schema. Are you sure you want to proceed?')) {
    annotation.value.steps = [];
    annotation.value.mode = mode;
  }
};

const groupOptions = [
  { label: 'Global', value: 'byClonotype' },
  { label: 'Per sample', value: 'bySampleAndClonotype' },
] satisfies SimpleOption<AnnotationMode>[];
</script>

<template>
  <PlSidebarItem>
    <template #header-content>
      <PlEditableTitle
        v-model="annotation.title"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Name"
        :autofocus="annotation.title.length === 0"
      />
    </template>
    <template v-if="annotation" #body-content>
      <div :class="$style.root">
        <PlBtnGroup :model-value="annotation.mode" :options="groupOptions" @update:model-value="updateAnnotationMode" />

        <PlBtnSecondary icon="add" @click="addStep">
          Add annotation
        </PlBtnSecondary>

        <span :class="$style.tip">Lower annotations override the ones above. Rearrange them by dragging.</span>

        <PlElementList
          v-model:items="annotation.steps"
          :get-item-key="(item) => item.id!"
          :is-active="(item) => item.id === selectedStepId"
          :item-class="$style.stepItem"
          :class="$style.steps"
          @item-click="(item) => selectedStepId = item.id"
        >
          <template #item-title="{ item }">
            {{ item.label }}
          </template>
        </PlElementList>
      </div>
    </template>
    <template #footer-content>
      <PlBtnGhost
        icon="delete-bin"
        reverse
        :disabled="annotation.steps.length === 0"
        @click.stop="annotation.steps = []"
      >
        Reset Schema
      </PlBtnGhost>
    </template>
  </PlSidebarItem>
</template>

<style lang="scss" module>
@use '@milaboratories/uikit/styles/variables' as *;

.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip {
  margin-top: 12px;
  color: var(--txt-03);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stepItem {
  cursor: pointer;
}
</style>
