<script setup lang="ts">
import { randomInt } from '@milaboratories/helpers';
import {
  PlBtnGhost,
  PlBtnSecondary,
  PlEditableTitle,
  PlElementList,
  PlSidebarItem,
} from '@milaboratories/uikit';
import type { Annotation } from '../types';

// Models
const annotation = defineModel<Annotation>('annotation', { required: true });
const selectedStepId = defineModel<undefined | number>('selectedStepId');
// Emits
const emits = defineEmits<{
  (e: 'delete-schema'): void;
}>();
// Actions
function handleAddStep() {
  const id = randomInt();
  annotation.value.steps.push({
    id,
    label: `Filter #${annotation.value.steps.length + 1}`,
    filter: {
      type: 'and',
      filters: [],
    },
  });
  selectedStepId.value = id;
};
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
        <PlBtnSecondary icon="add" @click="handleAddStep">
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
        @click.stop="emits('delete-schema')"
      >
        Delete Schema
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
