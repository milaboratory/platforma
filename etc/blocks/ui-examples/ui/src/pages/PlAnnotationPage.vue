<script setup lang="ts">
import { randomInt } from "@milaboratories/helpers";
import {
  stringifyColumnId,
  type ListOptionBase,
  type PObjectId,
  type SUniversalPColumnId,
  type CanonicalizedJson,
  type AxisId,
} from "@platforma-sdk/model";
import type { PlAdvancedFilterItem, Annotation } from "@platforma-sdk/ui-vue";
import { PlAnnotationsModal } from "@platforma-sdk/ui-vue";
import { ref, watch } from "vue";

const showModal = ref(true);
watch(showModal, (value) => {
  if (!value) {
    showModal.value = true;
  }
});

const sampleNameId = stringifyColumnId({ name: "sample_name", axes: [] }) as SUniversalPColumnId;
const countId = stringifyColumnId({ name: "count", axes: [] }) as SUniversalPColumnId;
const descriptionId = stringifyColumnId({ name: "description", axes: [] }) as SUniversalPColumnId;
const scoreId = stringifyColumnId({ name: "score", axes: [] }) as SUniversalPColumnId;
const frequencyId = stringifyColumnId({ name: "frequency", axes: [] }) as SUniversalPColumnId;

const mockAnnotations = ref<Annotation>({
  title: "Sample Pattern Filter",
  steps: [
    {
      id: randomInt(),
      label: "Text Pattern Filter",
      filter: {
        id: randomInt(),
        type: "and" as const,
        filters: [
          {
            id: randomInt(),
            type: "patternEquals" as const,
            column: sampleNameId,
            value: "Sample_001",
          },
        ],
      },
    },
    {
      id: randomInt(),
      label: "Numeric Comparison",
      filter: {
        id: randomInt(),
        type: "or" as const,
        filters: [
          {
            id: randomInt(),
            type: "greaterThan" as const,
            column: countId,
            x: 100,
          },
        ],
      },
    },
  ],
});

const mockColumns = ref<PlAdvancedFilterItem[]>([
  {
    id: sampleNameId,
    label: "Sample Name",
    error: false,
    spec: {
      kind: "PColumn",
      name: "sample_name",
      valueType: "String" as const,
      axesSpec: [],
    },
  },
  {
    id: countId,
    label: "Count",
    error: false,
    spec: {
      kind: "PColumn",
      name: "count",
      valueType: "Int" as const,
      axesSpec: [],
    },
  },
  {
    id: descriptionId,
    label: "Description",
    error: false,
    spec: {
      kind: "PColumn",
      name: "description",
      valueType: "String" as const,
      axesSpec: [],
    },
  },
  {
    id: scoreId,
    label: "Score",
    error: false,
    spec: {
      kind: "PColumn",
      name: "score",
      valueType: "Double" as const,
      axesSpec: [],
    },
  },
  {
    id: frequencyId,
    label: "Frequency",
    error: false,
    spec: {
      kind: "PColumn",
      name: "frequency",
      valueType: "Float" as const,
      axesSpec: [],
    },
  },
]);

const uniqueValuesByColumnId: Record<string, ListOptionBase<string>[]> = {
  [sampleNameId]: [
    { value: "Sample_001", label: "Sample_001" },
    { value: "Sample_002", label: "Sample_002" },
    { value: "Sample_003", label: "Sample_003" },
    { value: "Control_001", label: "Control_001" },
    { value: "Control_002", label: "Control_002" },
  ],
};

async function getSuggestOptions({
  columnId,
  searchStr,
}: {
  columnId: SUniversalPColumnId | CanonicalizedJson<AxisId>;
  searchStr: string;
  axisIdx?: number;
}) {
  return (uniqueValuesByColumnId[columnId] || []).filter((v) =>
    v.label.toLowerCase().includes(searchStr.toLowerCase()),
  );
}

async function getSuggestModel({
  columnId,
  searchStr,
}: {
  columnId: SUniversalPColumnId | CanonicalizedJson<AxisId>;
  searchStr: string;
  axisIdx?: number;
}) {
  const columnValues = uniqueValuesByColumnId[columnId];
  return (
    columnValues?.find((v) => v.value === searchStr) || {
      value: searchStr,
      label: `Label of ${searchStr}`,
    }
  );
}

const getValuesForSelectedColumns = async () => {
  // Mock implementation - in real app this would fetch actual column values
  return {
    columnId: sampleNameId as PObjectId,
    values: ["Sample_001", "Sample_002", "Sample_003", "Control_001", "Control_002"],
  };
};
</script>

<template>
  <div :class="$style.page">
    <PlAnnotationsModal
      v-model:opened="showModal"
      v-model:annotation="mockAnnotations"
      :columns="mockColumns"
      :hasSelectedColumns="true"
      :getSuggestOptions="getSuggestOptions"
      :getSuggestModel="getSuggestModel"
      :getValuesForSelectedColumns="getValuesForSelectedColumns"
    />

    <pre :class="$style.jsonBlock">{{ JSON.stringify(mockAnnotations, null, 2) }}</pre>
  </div>
</template>

<style module>
.page {
  width: 100%;
  padding: 20px;
  margin: 0 auto;
}

.jsonBlock {
  height: 100%;
  padding: 10px;
  border-radius: 4px;
}
</style>
