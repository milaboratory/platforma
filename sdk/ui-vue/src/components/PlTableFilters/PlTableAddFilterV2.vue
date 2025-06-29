<script setup lang="ts">
import {
  deepClone,
} from '@milaboratories/helpers';
import {
  PlBtnGhost,
  PlBtnPrimary,
  PlDropdown,
  PlSlideModal,
  type ListOption,
} from '@milaboratories/uikit';
import {
  computed,
  ref,
  watch,
} from 'vue';
import {
  type PlDataTableFilterStateInternal,
} from './types';
import {
  getFilterDefault,
} from './filters_logic';
import PlTableFilterEntryV2 from './PlTableFilterEntryV2.vue';

const show = defineModel<boolean>({ required: true });
const props = defineProps<{
  filters: Readonly<PlDataTableFilterStateInternal[]>;
  setFilter(idx: number, filter: PlDataTableFilterStateInternal): void;
}>();

const filterOptions = computed<ListOption<number>[]>(() => {
  return props.filters
    .map((s, i) => {
      return {
        value: i,
        text: s.label,
      };
    });
});

const newFilterIdx = ref<number>();
const newFilter = ref<PlDataTableFilterStateInternal | null>(null);
watch(
  () => newFilterIdx.value,
  (newFilterIdx) => {
    if (newFilterIdx === undefined) {
      newFilter.value = null;
    } else {
      const filterClone = deepClone(props.filters[newFilterIdx]);
      if (!filterClone.filter) {
        filterClone.filter = {
          value: filterClone.defaultFilter ?? getFilterDefault(filterClone.options[0].value),
          disabled: false,
          open: true,
        };
      }
      newFilter.value = filterClone;
    }
  },
);
const discardFilter = () => {
  newFilterIdx.value = undefined;
  show.value = false;
};
const applyFilter = () => {
  if (newFilterIdx.value !== undefined && newFilter.value) {
    props.setFilter(newFilterIdx.value, newFilter.value);
  }
  discardFilter();
};
</script>

<template>
  <PlSlideModal v-model="show" :close-on-outside-click="false">
    <template #title>Add Filter</template>
    <div class="d-flex flex-column gap-24">
      <PlDropdown
        v-model="newFilterIdx"
        :options="filterOptions"
        label="Column"
        placeholder="Choose..."
      />
      <div
        v-if="newFilterIdx === undefined"
        class="text-subtitle-m"
        style="color: var(--txt-mask)"
      >
        Choose a column to view and adjust its options
      </div>
      <PlTableFilterEntryV2
        v-if="newFilter"
        v-model="newFilter"
      />
    </div>
    <template #actions>
      <PlBtnPrimary :disabled="!newFilter" @click="applyFilter">Add Filter</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click="discardFilter">Cancel</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
