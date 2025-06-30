<script setup lang="ts">
import type { FilterUi, AnyForm } from '@platforma-sdk/model';
import { computed } from 'vue';
import { getFilterUiMetadata } from '@platforma-sdk/model';
import { PlIcon16, PlMaskIcon16 } from '@milaboratories/uikit';
import { useAnnotationsState } from './AnnotationsState';
import DynamicForm from './DynamicForm.vue';

defineEmits<{
  (e: 'delete'): void;
  (e: 'expand', value: boolean): void;
}>();

defineProps<{
  expanded?: boolean;
}>();

const state = useAnnotationsState();

const model = defineModel<FilterUi>({ default: () => ({}) });

const columnLabel = computed(() => {
  return state.value.columns?.find((c) => {
    if ('column' in model.value) {
      return c.id === model.value.column;
    }
    return false;
  })?.label ?? model.value.type;
});

const form = computed(() => {
  return getFilterUiMetadata(model.value.type).form as AnyForm;
});
</script>

<template>
  <div :class="$style.card">
    <div :class="[$style.header, { [$style.expanded]: expanded }]" @click="$emit('expand', !expanded)">
      <div :class="$style.icon">
        <PlIcon16 :class="$style.chevron" name="chevron-right" />
      </div>
      <div>{{ columnLabel }}</div>
      <PlMaskIcon16 :class="$style.delete" name="close" @click.stop="$emit('delete')" />
    </div>
    <div v-if="expanded" :class="$style.content">
      <DynamicForm v-model="model" :form="form" />
    </div>
  </div>
</template>

<style module>
.card {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: 6px;
  border: 1px solid #E1E3EB;
  overflow: hidden;
}

.header {
  --chevron-rotate: rotate(0);
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  overflow: hidden;
  color: var(--txt-01, #110529);
  font-size: 14px;
  font-weight: 600;
  user-select: none;
  &.expanded {
    background: linear-gradient(180deg, #EBFFEB 0%, #FFF 100%);
    --chevron-rotate: rotate(90deg);
  }
  &:not(.expanded) {
    background: #F7F8FA;
    &:hover {
      background: #fff;
    }
  }
}

.content {
  padding: 24px;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  min-height: 16px;
}

.chevron {
  transition: transform 0.2s ease-in-out;
  transform: var(--chevron-rotate);
}

.delete {
  margin-left: auto;
  cursor: pointer;
  background-color: #CFD1DB;
  &:hover {
    background-color: var(--txt-01);
  }
}
</style>
