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
  PlIcon24,
  PlSlideModal,
  PlBtnSecondary,
  PlMaskIcon16,
  PlMaskIcon24,
  // PlElementList,
} from '@milaboratories/uikit';
import {
  useDataTableToolsPanelTarget,
} from '../PlAgDataTableToolsPanel';
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
const teleportTarget = useDataTableToolsPanelTarget();

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

// const items = computed(() => filters.value.filter((s) => s.filter !== null));
// const toggledItems = computed({
//   get: () => new Set(items.value.filter((s) => s.filter?.disabled).map((s) => canonicalizeJson<PTableColumnId>(s.id))),
//   set: (keys) => {
//     items.value.forEach((s) => {
//       if (s.filter) {
//         s.filter.disabled = keys.has(canonicalizeJson<PTableColumnId>(s.id));
//       }
//     });
//   },
// });
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost @click.stop="showManager = true">
      Filters
      <template #append>
        <PlIcon24 :name="filtersOn ? 'filter-on' : 'filter'" />
      </template>
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>

    <!-- <PlElementList
      v-model:items="items"
      v-model:toggled-items="toggledItems"
      :enable-dragging="false"
      :get-item-key="(item) => canonicalizeJson<PTableColumnId>(item.id)"
    >
      <template #item-title="{ item }">
        {{ item.label }}
      </template>
      <template #item-content="{ index }">
        <PlTableFilterEntryV2 v-model="filters.value[index]" />
      </template>
    </PlElementList> -->

    <div ref="filterManager" :class="[$style['filter-manager'], 'd-flex', 'flex-column', 'gap-6']">
      <template v-for="(entry, index) in filters.value" :key="canonicalizeJson<PTableColumnId>(entry.id)">
        <div
          v-if="entry.filter"
          :class="[$style['filter'], { open: entry.filter.open, disabled: entry.filter.disabled }]"
        >
          <div
            :class="[$style['header'], 'd-flex', 'align-center', 'gap-8']"
            @click="entry.filter.open = !entry.filter.open"
          >
            <div :class="$style['expand-icon']">
              <PlMaskIcon16 name="chevron-right" />
            </div>

            <div :class="[$style['title'], 'flex-grow-1', 'text-s-btn']">
              {{ entry.label }}
            </div>

            <div :class="[$style['actions'], 'd-flex', 'gap-12']">
              <div :class="$style['toggle']" @click.stop="entry.filter.disabled = !entry.filter.disabled">
                <PlMaskIcon24 :name="entry.filter.disabled ? 'view-hide' : 'view-show'" />
              </div>

              <div :class="$style['delete']" @click.stop="entry.filter = null">
                <PlMaskIcon24 name="close" />
              </div>
            </div>
          </div>

          <div :class="[$style['content'], 'd-flex', 'gap-24', 'p-24', 'flex-column']">
            <PlTableFilterEntryV2 v-model="filters.value[index]" />
          </div>
        </div>
      </template>

      <div
        v-if="filters.value.length"
        :class="[$style['add-action-wrapper'], { 'pt-24': scrollIsActive }, 'd-flex', 'gap-24', 'flex-column']"
      >
        <div
          :disabled="canAddFilter"
          :class="$style['add-btn']"
          @click="showAddFilter = true"
        >
          <div :class="$style['add-btn-icon']">
            <PlMaskIcon16 name="add" />
          </div>
          <div :class="[$style['add-btn-title'], 'text-s-btn']">Add Filter</div>
        </div>

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
}

.filter-manager .text-s {
    font-weight: 600;
}

.add-action-wrapper {
    position: sticky;
    bottom: -16px;
    background-color: var(--bg-elevated-01);
    transition: all .15s ease-in-out;
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
}

.add-btn:hover {
    border-radius: 6px;
    border: 1px dashed var(--border-color-focus, #49CC49);
    background: rgba(99, 224, 36, 0.12);
}

.add-btn-title {
    flex-grow: 1;
}

.header {
    height: 40px;
    padding-left: 12px;
    padding-right: 12px;
    cursor: pointer;
}

.content {
    max-height: 0;
    overflow: hidden;
    transition: all .2s ease-in-out;
    padding-top: 0;
    padding-bottom: 0;
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

.filter:global(.open) .content {
    max-height: 1600px;
    padding: 24px;
    transition: all .2s ease-in-out;
}

.filter:global(.open) .header {
    background: linear-gradient(180deg, #EBFFEB 0%, #FFF 100%);
}
</style>
