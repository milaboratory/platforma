<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PlBtnGhost } from '../PlBtnGhost';
import { PlSidebar, PlSidebarItem } from '../PlSidebar';
import { PlElementList } from '../PlElementList';
import { PlBtnPrimary } from '../PlBtnPrimary';

type Annotation = {
  id: number;
  name: string;
};

const props = defineProps<{
  title: string;
  selectedItems?: { id: number }[];
}>();

const opened = defineModel<boolean>('opened');

const annotations = defineModel<Annotation[]>('annotations', {
  required: true,
});

// const filters = defineModel<Record<string, unknown[]>>('filters');

const activeAnnotation = defineModel<null | Annotation>('activeAnnotations', {
  default: null,
});
const activeAnnotations = computed(() => {
  return activeAnnotation.value ? new Set([activeAnnotation.value]) : undefined;
});

const getItemKey = (item: Annotation) => item.id;
const hasSelectedItems = computed(() => {
  return Array.isArray(props.selectedItems) && props.selectedItems.length > 0;
});

const createAnnotation = () => {
  const newAnnotation: Annotation = {
    id: Date.now(), // Simple ID generation
    name: `Annotation ${annotations.value.length + 1}`,
  };
  annotations.value.push(newAnnotation);
  activeAnnotation.value = newAnnotation;
};

const createAnnotationFromSelected = () => {
  throw new Error('Not implemented');
};

watch(annotations, (value) => {
  if (value.length === 0) {
    activeAnnotation.value = null;
  }
});

</script>

<template>
  <PlSidebar v-model:opened="opened" :class="$style.root" closable>
    <template #item-0="itemProps">
      <PlSidebarItem :key="itemProps.key" :class="[itemProps.class, $style.section]">
        <template #header-content>
          {{ props.title }}
        </template>
        <template #body-content>
          <div :class="$style.actions">
            <PlBtnPrimary @click.stop="createAnnotation">New Annotation</PlBtnPrimary>
            <PlBtnPrimary :disabled="!hasSelectedItems" @click.stop="createAnnotationFromSelected">From Selected</PlBtnPrimary>
          </div>
          <PlElementList
            v-model:items="annotations"
            :getItemKey="getItemKey"
            :activeItems="activeAnnotations"
            :itemClass="$style.annotationItem"
            @itemClick="(item) => activeAnnotation = item"
          >
            <template #item-title="{ item }">
              <div>
                {{ item.name }}
              </div>
            </template>
          </PlElementList>
        </template>
        <template #footer-content>
          <PlBtnGhost
            icon="delete-bin"
            reverse
            :disabled="annotations.length === 0"
            @click.stop="annotations = []"
          >
            Reset Schema
          </PlBtnGhost>
        </template>
      </PlSidebarItem>
    </template>
    <template #item-1="itemProps">
      <PlSidebarItem :key="itemProps.key" :class="[itemProps.class, $style.section]">
        <template #body-content>
          <div>{{ activeAnnotation?.name }}</div>
        </template>
      </PlSidebarItem>
    </template>
  </PlSidebar>
</template>

<style module>
.root {
  width: calc(368px * 2);
}

.section {

}

.annotationItem {
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 8px;
}
</style>
