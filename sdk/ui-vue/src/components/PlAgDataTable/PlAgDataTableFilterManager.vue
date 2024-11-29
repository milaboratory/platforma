<script setup lang="ts">
import type { ListOption } from '@milaboratories/uikit';
import { PlDropdown, PlMaskIcon16, PlMaskIcon24, PlTextField, PlToggleSwitch, Slider } from '@milaboratories/uikit';
import type { PlTableFilterEntry, PlTableFiltersModel, PlTableFilterType, PTableColumnSpec } from '@platforma-sdk/model';
import { reactive } from 'vue';

const props = defineProps<{
  getNameForColId(columnId: PlTableFilterEntry['columnId']): string;
  filterOptions: Record<string, ListOption<PlTableFilterType>[]>;
  updateColumnFilter(columnId: string, type: PlTableFilterType): void;
  parseNumber(column: PTableColumnSpec, value: string): number;
  parseString(column: PTableColumnSpec, value: string): string;
  parseRegex(value: string): string;
  resetColumnFilter(columnId: PlTableFilterEntry['columnId']): void;
  makeWildcardOptions(
    column: PTableColumnSpec,
    reference: string,
  ): {
    value: string;
    text: string;
  }[];
  columnsWithIds: {
    column: PTableColumnSpec;
    id: string;
  }[];
}>();
defineEmits(['addFilter']);

const model = defineModel<PlTableFiltersModel['state']>({ required: true });

const openState = reactive<Record<string, boolean>>({});

function getColumn(columnId: PlTableFilterEntry['columnId']): PTableColumnSpec {
  return props.columnsWithIds.find((i) => i.id === columnId)!.column;
}

function toggleExpandFilter(columnId: PlTableFilterEntry['columnId']) {
  if (!openState[columnId]) {
    openState[columnId] = true;
  } else {
    delete openState[columnId];
  }
}

function deleteFilter(index: number) {
  model.value?.splice(index, 1);
}
</script>
<template>
  <div class="pl-filter-manager d-flex flex-column gap-6">
    <div v-for="(entry, index) in model" :key="entry.columnId" :class="{ open: openState[entry.columnId] }" class="pl-filter-manager__filter">
      <div class="pl-filter-manager__header d-flex align-center gap-8" @click="toggleExpandFilter(entry.columnId)">
        <div class="pl-filter-manager__expand-icon">
          <PlMaskIcon16 name="chevron-right" />
        </div>

        <div class="pl-filter-manager__title flex-grow-1 text-s">{{ getNameForColId(entry.columnId) }}</div>

        <div class="pl-filter-manager__actions d-flex gap-12">
          <div class="pl-filter-manager__toggle" @click.stop="entry.disabled = !entry.disabled">
            <PlMaskIcon24 :name="entry.disabled ? 'view-hide' : 'view-show'" />
          </div>

          <div class="pl-filter-manager__delete" @click.stop="deleteFilter(index)">
            <PlMaskIcon24 name="close" />
          </div>
        </div>
      </div>

      <div class="pl-filter-manager__content d-flex gap-24 p-24 flex-column">
        <PlDropdown
          v-if="entry"
          :model-value="entry.filter.type"
          :options="filterOptions[entry.columnId]"
          label="Predicate"
          @update:model-value="(type) => updateColumnFilter(entry.columnId, type!)"
        />
        <template
          v-if="
            entry.filter.type === 'number_equals' ||
            entry.filter.type === 'number_notEquals' ||
            entry.filter.type === 'number_lessThan' ||
            entry.filter.type === 'number_lessThanOrEqualTo' ||
            entry.filter.type === 'number_greaterThan' ||
            entry.filter.type === 'number_greaterThanOrEqualTo'
          "
        >
          <PlTextField
            v-model="entry.filter.reference"
            :parse="(value: string): number => parseNumber(getColumn(entry.columnId), value)"
            label="Reference value"
          />
        </template>
        <template v-if="entry.filter.type === 'number_between'">
          <PlTextField
            v-model="entry.filter.lowerBound"
            :parse="(value: string): number => parseNumber(getColumn(entry.columnId), value)"
            label="Lower bound"
          />
          <PlToggleSwitch v-model="entry.filter.includeLowerBound" label="Include lower bound" />
          <PlTextField
            v-model="entry.filter.upperBound"
            :parse="(value: string): number => parseNumber(getColumn(entry.columnId), value)"
            label="Upper bound"
          />
          <PlToggleSwitch v-model="entry.filter.includeUpperBound" label="Include upper bound" />
        </template>
        <template
          v-if="
            entry.filter.type === 'string_equals' ||
            entry.filter.type === 'string_notEquals' ||
            entry.filter.type === 'string_contains' ||
            entry.filter.type === 'string_doesNotContain'
          "
        >
          <PlTextField
            v-model="entry.filter.reference"
            :parse="(value: string): string => parseString(getColumn(entry.columnId), value)"
            label="Reference value"
          />
        </template>
        <template v-if="entry.filter.type === 'string_matches' || entry.filter.type === 'string_doesNotMatch'">
          <PlTextField v-model="entry.filter.reference" :parse="parseRegex" label="Reference value" />
        </template>
        <template v-if="entry.filter.type === 'string_containsFuzzyMatch'">
          <PlTextField
            v-model="entry.filter.reference"
            :parse="(value: string): string => parseString(getColumn(entry.columnId), value)"
            label="Reference value"
          />
          <Slider v-model="entry.filter.maxEdits" :max="5" breakpoints label="Maximum nuber of substitutions and indels" />
          <PlToggleSwitch v-model="entry.filter.substitutionsOnly" label="Substitutions only" />
          <PlDropdown
            v-model="entry.filter.wildcard"
            :options="makeWildcardOptions(getColumn(entry.columnId), entry.filter.reference)"
            clearable
            label="Wildcard symbol"
          />
        </template>

        <div class="d-flex justify-center">
          <div class="pl-filter-manager__revert-btn text-s d-flex align-center gap-8" @click="resetColumnFilter(entry.columnId)">
            Revert Settings to Default
            <PlMaskIcon24 name="reverse" />
          </div>
        </div>
      </div>
    </div>

    <div class="pl-filter-manager__add-btn" @click="$emit('addFilter')">
      <div class="pl-filter-manager__add-btn-icon">
        <PlMaskIcon16 name="add" />
      </div>
      <div class="pl-filter-manager__add-btn-title">Add Filter</div>
    </div>
  </div>
</template>
