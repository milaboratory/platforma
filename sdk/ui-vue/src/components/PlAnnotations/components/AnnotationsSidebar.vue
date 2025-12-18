<script setup lang="ts">
import $commonStyle from './style.module.css';

import { randomInt } from '@milaboratories/helpers';
import {
  PlBtnGhost,
  PlBtnSecondary,
  PlEditableTitle,
  PlElementList,
  PlSidebarItem,
  PlTextField,
} from '@milaboratories/uikit';
import type { Annotation } from '../types';
import { validateTitle } from '../utils';
import { isEmpty } from 'es-toolkit/compat';

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
    label: '',
    filter: {
      id: randomInt(),
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
        :class="{ [$commonStyle.flashing]: annotation.title.length === 0 }"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Title"
        :autofocus="annotation.title.length === 0"
        :validate="validateTitle"
      />
    </template>
    <template v-if="annotation" #body-content>
      <div :class="[$style.root, { [$commonStyle.disabled]: annotation.title.length === 0 }]">
        <span :class="$style.tip">Above annotations override the ones below. Rearrange them by dragging.</span>

        <PlElementList
          v-model:items="annotation.steps"
          :get-item-key="(item) => item.id"
          :is-active="(item) => item.id === selectedStepId"
          :item-class="$style.stepItem"
          :class="$style.steps"
          @item-click="(item) => selectedStepId = item.id"
        >
          <template #item-title="{ item }">
            {{ item.label }}
          </template>
        </PlElementList>

        <PlBtnSecondary icon="add" @click="handleAddStep">
          Add label
        </PlBtnSecondary>

        <PlTextField
          :class="[$style.defaultValue, { [$style.emptyDefaultValue]: isEmpty(annotation.defaultValue) }]"
          :model-value="annotation.defaultValue ?? ''"
          label="Label remaining with"
          placeholder="No label"
          clearable
          helper="This label will be applied to the remaining rows, after all other filters are applied."
          @click.stop
          @update:model-value="annotation.defaultValue = $event === '' ? undefined : $event"
        />
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

.defaultValue {
  margin-top: 8px;
}
.emptyDefaultValue {
  opacity: 0.5;
  transition: opacity 0.2s ease-in-out;

  &:hover {
    opacity: 1;
  }
}
</style>
