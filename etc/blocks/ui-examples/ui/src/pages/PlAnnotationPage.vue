<script setup lang="ts">
import { randomInt } from '@milaboratories/helpers';
import type { SUniversalPColumnId } from '@platforma-sdk/model';
import { ref, watch } from 'vue';

const showModal = ref(true);
watch(showModal, (value) => {
  if (!value) {
    showModal.value = true;
  }
});

const mockAnnotations = ref({
  title: 'Sample Pattern Filter',
  steps: [
    {
      id: 1,
      label: 'Text Pattern Filter',
      filter: {
        id: randomInt(),
        type: 'and' as const,
        filters: [
          {
            id: randomInt(),
            type: 'patternEquals' as const,
            column: 'sample_name' as SUniversalPColumnId,
            value: 'Sample_001',
          },
        ],
      },
    },
    {
      id: 2,
      label: 'Numeric Comparison',
      filter: {
        id: randomInt(),
        type: 'or' as const,
        filters: [
          {
            id: randomInt(),
            type: 'greaterThan' as const,
            column: 'count' as SUniversalPColumnId,
            x: 100,
          },
        ],
      },
    },
  ],
});

// const mockColumns = ref<PlAdvancedFilterItem[]>([
//   {
//     id: 'sample_name' as SUniversalPColumnId,
//     label: 'Sample Name',
//     spec: {
//       kind: 'PColumn',
//       name: 'sample_name',
//       valueType: 'String' as const,
//       axesSpec: [
//         // {},
//       ],
//     } satisfies PColumnSpec,
//   },
//   {
//     id: 'count' as SUniversalPColumnId,
//     label: 'Count',
//     obj: {
//       valueType: 'Int' as const,
//       annotations: {},
//     },
//   },
//   {
//     id: 'description' as SUniversalPColumnId,
//     label: 'Description',
//     obj: {
//       valueType: 'String' as const,
//       annotations: {},
//     },
//   },
//   {
//     id: 'score' as SUniversalPColumnId,
//     label: 'Score',
//     obj: {
//       valueType: 'Double' as const,
//       annotations: {},
//     },
//   },
//   {
//     id: 'frequency' as SUniversalPColumnId,
//     label: 'Frequency',
//     obj: {
//       valueType: 'Float' as const,
//       annotations: {},
//     },
//   },
// ]);

// const getValuesForSelectedColumns = async () => {
//   // Mock implementation - in real app this would fetch actual column values
//   return {
//     columnId: 'sample_name' as PObjectId,
//     values: ['Sample_001', 'Sample_002', 'Sample_003', 'Control_001', 'Control_002'],
//   };
// };
</script>

<template>
  <div :class="$style.page">
    <!-- <PlAnnotationsModal
      v-model:opened="showModal"
      v-model:annotation="mockAnnotations"
      :columns="mockColumns"
      :hasSelectedColumns="true"
      :getValuesForSelectedColumns="getValuesForSelectedColumns"
    /> -->

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
