<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { reactive } from 'vue';
import { PlDropdown } from '@milaboratories/uikit';
import { generate } from '@/imports';
import { faker } from '@faker-js/faker';

const testItemOptions = generate(100, (i) => ({
  text: `${i}: ${faker.lorem.sentence({ min: 1, max: 10 })}`,
  value: {
    i,
  },
}));

const numOptions = generate(10, (i) => ({
  text: `Options ${i}`,
  value: i,
}));

const optionsTitleAndDescription = generate(100, (i) => ({
  text: `Title ${i}`,
  description: `Description ${i}: ${faker.lorem.sentence({ min: 1, max: 10 })}`,
  value: {
    i,
  },
}));

const data = reactive({
  value: {
    i: 1,
  },

  numValue: 1,
  geneFeature: 'Test',
});
</script>

<template>
  <Layout>
    <Split name="Dropdown" style="min-height: 600px">
      <div style="display: flex; flex-direction: column; gap: 30px; max-width: 320px">
        <PlDropdown v-model="data.value" label="Title & description" :options="optionsTitleAndDescription" />
        <PlDropdown v-model="data.numValue" label="Num value" :options="numOptions" />
        <PlDropdown v-model="data.value" label="Label" :options="testItemOptions" />
        <PlDropdown v-model="data.value" label="Label Required" required :options="testItemOptions" />
        <PlDropdown v-model="data.value" label="Has tooltip & clearable" clearable :options="testItemOptions">
          <template #tooltip> Tooltip content Second line Third line </template>
        </PlDropdown>
        <PlDropdown v-model="data.value" label="Has error" :options="testItemOptions" error="Some error description" />
        <PlDropdown v-model="data.value" label="Disabled" :disabled="true" :options="testItemOptions" />
        <PlDropdown v-model="data.value" label="Altered arrow icon" :options="testItemOptions" arrow-icon="clips" />
      </div>
    </Split>
  </Layout>
</template>
