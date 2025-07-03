<script lang="ts" setup>
import {
  type PlDataTableFilterState,
  canonicalizeJson,
  type PTableColumnId,
} from '@platforma-sdk/model';
import type {
  PlDataTableFiltersSettings,
} from './types';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toRefs,
  watch,
} from 'vue';
import {
  PlBtnGhost,
  PlSlideModal,
  PlBtnSecondary,
  PlMaskIcon16,
  PlElementList,
  usePlBlockPageTitleTeleportTarget,
} from '@milaboratories/uikit';
import { useFilters } from './filters-state';
import PlTableAddFilterV2 from './PlTableAddFilterV2.vue';
import PlTableFilterEntryV2 from './PlTableFilterEntryV2.vue';
import { isJsonEqual } from '@milaboratories/helpers';

const state = defineModel<PlDataTableFilterState[]>({
  default: [],
});
const props = defineProps<{
  settings: Readonly<PlDataTableFiltersSettings>;
}>();
const { settings } = toRefs(props);

const filters = useFilters(settings, state);

const filtersOn = computed<boolean>(() => filters.value.some((s) => s.filter && !s.filter.disabled));

const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = usePlBlockPageTitleTeleportTarget('PlTableFiltersV2');

const showManager = ref(false);

const scrollIsActive = ref(false);
const filterManager = ref<HTMLElement>();
let observer: ResizeObserver;
onMounted(() => {
  observer = new ResizeObserver(() => {
    const parent = filterManager.value?.parentElement;
    if (!parent) return;
    scrollIsActive.value = parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth;
  });
  if (filterManager.value && filterManager.value.parentElement) {
    observer.observe(filterManager.value!.parentElement);
  }
});

watch(filterManager, (newElement, oldElement) => {
  if (oldElement?.parentElement) {
    observer.unobserve(oldElement.parentElement);
  }
  if (newElement?.parentElement) {
    observer.observe(newElement.parentElement);
  }
});

onBeforeUnmount(() => {
  if (observer !== undefined) {
    observer.disconnect();
  }
});

const canAddFilter = computed<boolean>(() => filters.value.some((s) => !s.filter));
const showAddFilter = ref(false);

const canResetToDefaults = computed<boolean>(() => {
  return filters.value
    .some((s) => (!s.defaultFilter && s.filter) || (s.defaultFilter
      && (s.filter?.disabled === true || !isJsonEqual(s.filter?.value, s.defaultFilter))));
});
const resetToDefaults = () => {
  filters.value.forEach((s) => {
    if (s.defaultFilter) {
      s.filter = {
        value: s.defaultFilter,
        disabled: false,
        open: false,
      };
    } else {
      s.filter = null;
    }
  });
};

const items = computed(() => filters.value.filter((s) => s.filter !== null));
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost :icon="filtersOn ? 'filter-on' : 'filter'" @click.stop="showManager = true">
      Filters
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>

    <div ref="filterManager" :class="$style['filter-manager']">
      <PlElementList
        v-model:items="items"
        :on-expand="(item) => {
          if (item.filter) {
            item.filter.open = !item.filter.open;
          }
        }"
        :is-expanded="(item) => item.filter?.open ?? false"
        :on-toggle="(item) => {
          if (item.filter) {
            item.filter.disabled = !item.filter.disabled;
          }
        }"
        :is-toggled="(item) => item.filter?.disabled ?? false"
        :on-remove="(item) => {
          if (item.filter) {
            item.filter = null;
          }
        }"
        :get-item-key="(item) => canonicalizeJson<PTableColumnId>(item.id)"
        disable-dragging
      >
        <template #item-title="{ item }">
          {{ item.label }}
        </template>
        <template #item-content="{ index }">
          <PlTableFilterEntryV2 v-model="filters.value[index]" />
        </template>
      </PlElementList>

      <div
        v-if="filters.value.length"
        :class="$style['add-action-wrapper']"
      >
        <button
          :disabled="!canAddFilter"
          :class="$style['add-btn']"
          @click="showAddFilter = true"
        >
          <PlMaskIcon16 name="add" />
          <div :class="$style['add-btn-title']">Add Filter</div>
        </button>

        <PlBtnSecondary
          :disabled="!canResetToDefaults"
          @click.stop="resetToDefaults"
        >
          Reset to defaults
        </PlBtnSecondary>
      </div>

      <div v-if="!filters.value.length">No filters applicable</div>
    </div>
  </PlSlideModal>

  <PlTableAddFilterV2
    v-model="showAddFilter"
    :filters="filters.value"
    :set-filter="(idx, filter) => filters.value[idx] = filter"
  />
</template>

<style lang="scss" module>
.filter-manager {
    --expand-icon-rotation: rotate(0deg);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.add-action-wrapper {
    position: sticky;
    bottom: -16px;
    background-color: var(--bg-elevated-01);
    transition: all .15s ease-in-out;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.add-btn {
    height: 40px;
    background-color: var(--bg-elevated-01);
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    padding-right: 12px;
    border-radius: 6px;
    border: 1px dashed var(--border-color-div-grey);
    line-height: 0;
    cursor: pointer;
    text-align: left;
}

.add-btn:disabled {
    --icon-color: var(--dis-01);
    cursor: auto;
}

.add-btn:not([disabled]):hover {
    border-radius: 6px;
    border: 1px dashed var(--border-color-focus, #49CC49);
    background: rgba(99, 224, 36, 0.12);
}

.add-btn-title {
    flex-grow: 1;
    font-weight: 600;
}

.expand-icon {
    transition: all .15s ease-in-out;
    transform: var(--expand-icon-rotation);
    line-height: 0;
    cursor: pointer;
}

.toggle,
.delete {
    line-height: 0;
    cursor: pointer;
    display: none;
}

.toggle .mask-24,
.delete .mask-24 {
    --icon-color: var(--ic-02);
}

.toggle:hover .mask-24 {
    --icon-color: var(--ic-01);
}

.delete:hover .mask-24 {
    --icon-color: var(--ic-01);
}

.filter:hover .toggle,
.filter:hover .delete {
    display: block;
}

.filter {
    border-radius: 6px;
    border: 1px solid var(--border-color-div-grey);
    background-color: var(--bg-base-light);
    transition: background-color .15s ease-in-out;
    overflow: auto;
}

.filter.disabled .expand-icon,
.filter.disabled .title {
    opacity: 0.3;
}

.filter:hover {
    background-color: var(--bg-elevated-01);
}

.filter:global(.open) {
    background-color: var(--bg-elevated-01);
    --expand-icon-rotation: rotate(90deg);
}
</style>
