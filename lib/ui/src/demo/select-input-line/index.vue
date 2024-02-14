<template>
  <Layout>
    <Split name="Select input">
      <div>
        <SelectInputLine v-model="model0" :items="items0" :prefix="'Option:'">
          <template #item="slotProps">
            <DropdownListItem v-bind="slotProps" :size="'medium'" />
          </template>
        </SelectInputLine>
        <SelectInputLine v-model="model1" :items="items1" :prefix="'List:'" />
        <SelectInputLine v-model="model2" :mode="'tabs'" :items="items2" :prefix="'Tab:'" />
      </div>
      <div>
        {{ model0 }}
      </div>
      <div>
        {{ model1 }}
      </div>
      <div>
        {{ model2 }}
      </div>
    </Split>
  </Layout>
</template>
<script setup lang="ts">
import SelectInputLine from '@/lib/components/SelectInputLine.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import { generate } from '@/lib/helpers/functions';
import { ref } from 'vue';

const items0 = generate(30, (i) => ({
  text: `Option ${i}`,
  value: {
    i,
  },
}));

const items1 = generate(40, (i) => ({
  text: `List item ${i}`,
  value: {
    i,
  },
}));

const items2 = generate(300, (i) => ({
  text: `Tab ${i}`,
  value: {
    i,
  },
}));

const model0 = ref([]);
const model1 = ref([{ text: 'List item 35', value: { i: 35 } }]);
const model2 = ref([{ text: 'Tab 2', value: { i: 2 } }]);
</script>
