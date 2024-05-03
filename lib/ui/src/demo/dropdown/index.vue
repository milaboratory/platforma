<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import { reactive } from 'vue';
import SelectInput from '@/lib/components/SelectInput.vue';
import GeneFeature from '@/lib/components/mixcr/GeneFeatureDropdown/index.vue';
import { generate } from '@/lib/helpers/functions';
import { faker } from '@faker-js/faker';

const options = generate(100, (i) => ({
  text: `${i}: ${faker.lorem.sentence({ min: 1, max: 10 })}`,
  value: {
    i,
  },
}));
const optionsTitleAndDescription = generate(100, (i) => ({
  text: { title: `Title ${i}`, description: `Description ${i}: ${faker.lorem.sentence({ min: 1, max: 10 })}` },
  value: {
    i,
  },
}));

const data = reactive({
  value: options[0]?.value,
  geneFeature: 'Test',
});
</script>

<template>
  <layout>
    <split name="Dropdown" style="min-height: 600px">
      <div style="display: flex; flex-direction: column; gap: 30px; max-width: 320px">
        <div>
          <h3>Title and description</h3>
          <select-input v-model="data.value" :options="optionsTitleAndDescription" />
        </div>
        <select-input v-model="data.value" :options="options" />
        <select-input v-model="data.value" label="Label" :options="options" />
        <select-input v-model="data.value" label="Has tooltip" :options="options">
          <template #tooltip> Tooltip content Second line Third line </template>
        </select-input>
        <select-input v-model="data.value" label="Has error" :options="options" error="Some error description" />
        <select-input v-model="data.value" label="Disabled" :disabled="true" :options="options" />
        <select-input v-model="data.value" label="Altered arrow icon" :options="options" arrow-icon="clips" />
      </div>
      <div>
        <gene-feature v-model="data.geneFeature" />
      </div>
    </split>
  </layout>
</template>
