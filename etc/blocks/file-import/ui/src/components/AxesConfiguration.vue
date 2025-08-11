<script setup lang="ts">
import type { AxisSpecParamUI } from '@milaboratories/milaboratories.file-import-block.model';
import {
  PlBtnPrimary,
  PlCheckbox,
  PlDropdown,
  PlElementList,
  PlTextArea,
  PlTextField,
} from '@platforma-sdk/ui-vue';
import { VALUE_TYPE_OPTIONS } from '../types/spec';
import { jsonToString, stringToJson } from '../utils/json';

const axesSpecParamsUI = defineModel<AxisSpecParamUI[]>({
  required: true,
});

const addAxis = () => {
  axesSpecParamsUI.value.push({
    id: Date.now().toString(),
    expanded: true,
    disabled: false,
    payload: {
      column: '',
      allowNA: false,
      spec: {
        type: 'String',
      },
    },
  } satisfies AxisSpecParamUI);
};

const updateAxisDomain = (index: number, value: string) => {
  axesSpecParamsUI.value[index].payload.spec.domain = stringToJson(value);
};

const updateAxisAnnotations = (index: number, value: string) => {
  axesSpecParamsUI.value[index].payload.spec.annotations = stringToJson(value);
};

</script>

<template>
  <div :class="$style.section">
    <div :class="$style.sectionHeader">
      <h3>Axes Configuration</h3>
      <PlBtnPrimary @click="addAxis">Add Axis</PlBtnPrimary>
    </div>

    <div v-if="axesSpecParamsUI.length === 0" :class="$style.emptyState">
      No axes configured. Click "Add Axis" to add your first axis.
    </div>

    <PlElementList
      v-if="axesSpecParamsUI.length > 0" v-model:items="axesSpecParamsUI" :get-item-key="(item) => item.id"
      :is-expanded="(item) => item.expanded" :on-expand="(item) => item.expanded = !item.expanded"
      :is-toggled="(item) => item.disabled" :on-toggle="(item) => item.disabled = !item.disabled"
    >
      <template #item-title="{ item: axis, index }">
        <strong>Axis {{ index + 1 }}</strong>
        <span v-if="axis.payload.column" :class="$style.axisLabel">{{ axis.payload.column }}</span>
      </template>

      <template #item-content="{ item: axis, index }">
        <div :class="$style.formRow">
          <PlTextField v-model="axis.payload.column" label="Column" placeholder="Column label from XSV file" required />

          <PlTextField
            :model-value="axis.payload.filterOutRegex || ''" label="Filter Out Regex"
            placeholder="Regex to filter out rows (optional)"
            @update:model-value="axis.payload.filterOutRegex = $event || undefined"
          />
        </div>

        <div :class="$style.formRow">
          <PlTextField
            :model-value="axis.payload.naRegex || ''" label="NA Regex"
            placeholder="Regex to identify N/A values (optional)"
            @update:model-value="axis.payload.naRegex = $event || undefined"
          />

          <PlCheckbox :model-value="axis.payload.allowNA || false" @update:model-value="axis.payload.allowNA = $event">
            Allow NA Values
          </PlCheckbox>
        </div>

        <!-- Axis Spec -->
        <div :class="$style.nestedSection">
          <h5>Axis Specification</h5>

          <div :class="$style.formRow">
            <PlTextField
              :model-value="axis.payload.spec.name || ''" label="Name" :placeholder="axis.payload.column"
              @update:model-value="axis.payload.spec.name = $event || undefined"
            />

            <PlDropdown v-model="axis.payload.spec.type" :options="VALUE_TYPE_OPTIONS" label="Type" required />
          </div>

          <div :class="$style.formRow">
            <PlTextArea
              :model-value="jsonToString(axis.payload.spec.domain)" label="Domain (JSON)" placeholder="{}"
              @update:model-value="updateAxisDomain(index, $event)"
            />

            <PlTextArea
              :model-value="jsonToString(axis.payload.spec.annotations)" label="Annotations (JSON)"
              placeholder="{}" @update:model-value="updateAxisAnnotations(index, $event)"
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

.axisLabel {
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

@media (max-width: 768px) {
  .formRow {
    grid-template-columns: 1fr;
  }

  .sectionHeader {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>
