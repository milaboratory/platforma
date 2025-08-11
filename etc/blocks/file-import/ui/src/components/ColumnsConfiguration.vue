<script setup lang="ts">
import type { ColumnSpecParamUI, ValueType } from '@milaboratories/milaboratories.file-import-block.model';
import {
  PlBtnSecondary,
  PlCheckbox,
  PlDropdown,
  PlElementList,
  PlTextArea,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import type { XsvMetadata } from '../hooks/useMetadataXsv';
import { VALUE_TYPE_OPTIONS } from '../types/spec';
import { jsonToString, stringToJson } from '../utils/json';
import AddColumn from './AddColumn.vue';

const columnsSpecParamsUI = defineModel<ColumnSpecParamUI[]>({
  required: true,
});

const props = defineProps<{
  metadata: XsvMetadata;
}>();

const addColumn = (column: undefined | string, valueType: undefined | ValueType) => {
  columnsSpecParamsUI.value.push({
    id: Date.now().toString(),
    expanded: true,
    disabled: false,
    payload: {
      column: column ?? '',
      spec: {
        valueType: valueType ?? 'String',
        name: column ?? '',
      },
    },
  });
};

const handleCreateAll = () => {
  props.metadata.header.forEach((column) => {
    if (columnsSpecParamsUI.value.some((c) => c.payload.column === column)) {
      return; // Skip if column already exists
    }

    columnsSpecParamsUI.value.push({
      id: Date.now().toString(),
      expanded: false,
      disabled: false,
      payload: {
        column,
        spec: {
          valueType: props.metadata.types[column] ?? 'String',
          name: column,
        },
      },
    });
  });
};

const handleRemoveAll = () => {
  columnsSpecParamsUI.value.length = 0;
};

const updateColumnDomain = (index: number, value: string) => {
  columnsSpecParamsUI.value[index].payload.spec.domain = stringToJson(value);
};

const updateColumnAnnotations = (index: number, value: string) => {
  columnsSpecParamsUI.value[index].payload.spec.annotations = stringToJson(value);
};
</script>

<template>
  <div :class="$style.section">
    <div :class="$style.sectionHeader">
      <h3>Columns Configuration</h3>
      <div :class="$style.headerActions">
        <PlBtnSecondary :class="$style.headerBtn" @click="handleCreateAll">
          Create All
        </PlBtnSecondary>
        <PlBtnSecondary :class="$style.headerBtn" @click="handleRemoveAll">
          Remove All
        </PlBtnSecondary>
        <AddColumn :metadata="props.metadata" @add="addColumn"/>
      </div>
    </div>

    <div v-if="columnsSpecParamsUI.length === 0" :class="$style.emptyState">
      No columns configured. Click "Add Column" to add your first column.
    </div>

    <PlElementList
      v-if="columnsSpecParamsUI.length > 0" v-model:items="columnsSpecParamsUI"
      :get-item-key="(item) => item.id" :is-expanded="(item) => item.expanded"
      :on-expand="(item) => item.expanded = !item.expanded" :is-toggled="(item) => item.disabled"
      :on-toggle="(item) => item.disabled = !item.disabled"
    >
      <template #item-title="{ item: column, index }">
        <strong>Column {{ index + 1 }}</strong>
        <span v-if="column.payload.column" :class="$style.columnLabel">{{ column.payload.column }}</span>
      </template>

      <template #item-content="{ item: column, index }">
        <div :class="$style.formRow">
          <PlTextField
            v-model="column.payload.column" label="Column" placeholder="Column label from XSV file"
            required
          />

          <PlTextField
            :model-value="column.payload.filterOutRegex || ''"
            label="Filter Out Regex" placeholder="Regex to filter out rows (optional)"
            @update:model-value="column.payload.filterOutRegex = $event || undefined"
          />
        </div>

        <div :class="$style.formRow">
          <PlTextField
            :model-value="column.payload.naRegex || ''"
            label="NA Regex" placeholder="Regex to identify N/A values (optional)"
            @update:model-value="column.payload.naRegex = $event || undefined"
          />

          <PlCheckbox
            :model-value="column.payload.allowNA || false"
            @update:model-value="column.payload.allowNA = $event"
          >
            Allow NA Values
          </PlCheckbox>
        </div>

        <div :class="$style.formRow">
          <PlTextField
            :model-value="column.payload.id || ''"
            label="ID" placeholder="Column ID (defaults to sanitized column label)"
            @update:model-value="column.payload.id = $event || undefined"
          />
        </div>

        <!-- Column Spec -->
        <div :class="$style.nestedSection">
          <h5>Column Specification</h5>

          <div :class="$style.formRow">
            <PlTextField
              :model-value="column.payload.spec.name || ''"
              label="Name" :placeholder="column.payload.column"
              @update:model-value="column.payload.spec.name = $event || undefined"
            />

            <PlDropdown
              v-model="column.payload.spec.valueType" :options="VALUE_TYPE_OPTIONS" label="Value Type"
              required
            />
          </div>

          <div :class="$style.formRow">
            <PlTextArea
              :model-value="jsonToString(column.payload.spec.domain)"
              label="Domain (JSON)" placeholder="{}" @update:model-value="updateColumnDomain(index, $event)"
            />

            <PlTextArea
              :model-value="jsonToString(column.payload.spec.annotations)"
              label="Annotations (JSON)" placeholder="{}"
              @update:model-value="updateColumnAnnotations(index, $event)"
            />
          </div>
        </div>
      </template>
    </PlElementList>
  </div>
</template>

<style module>
.section {
  margin-bottom: 40px;
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.sectionHeader h3 {
  margin: 0;
  color: var(--txt-01);
}

.headerActions {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  gap: 8px;
}

.headerBtn {
  min-width: 80px;
}

.columnLabel {
  margin-left: 8px;
  color: var(--txt-03);
  font-size: 14px;
  font-style: italic;
}

.formRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.nestedSection {
  margin-top: 20px;
  padding: 16px;
  background-color: var(--bg-base);
  border-radius: 6px;
  border: 1px solid var(--border-color-div-grey);
}

.nestedSection h5 {
  margin: 0 0 16px 0;
  color: var(--txt-01);
  font-size: 14px;
  font-weight: 600;
}

.emptyState {
  text-align: center;
  padding: 40px;
  color: var(--txt-03);
  font-style: italic;
  background-color: var(--bg-elevated-01);
  border-radius: 8px;
  border: 1px dashed var(--border-color-div-grey);
}

</style>
