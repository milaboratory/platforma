<script setup lang="ts">
import SelectInputLine from '@/lib/components/SelectInputLine.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import { generate } from '@/lib/helpers/functions';
import { ref } from 'vue';
import PropsDisplay from '@/demo/PropsDisplay.vue';

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

const propsDescription = {
  modelValue: {
    type: 'Record < string, unknown> [];',
    description: 'Model for component v-model'
  },
  disabled: {
    type: '?boolean;',
    description: 'Is component disable or not'
  },
  prefix: {
    type: '?string;',
    description: 'Prefix in UI'
  },
  items: {
    type: 'SelectInputItem[];',
    description: 'Items for component'
  },
  itemText: {
    type: '?string;',
    description: 'Property name for item where we should get text value for UI'
  },
  itemValue: {
    type: '?string;',
    description: 'Property name for item where we should get value for inner comparison'
  },
  placeholder: {
    type: '?string;',
    description: 'UI placeholder'
  },
  mode: {
    type: "'list' | '?tabs';",
    description: 'Component has two types of list "tabs" view and "list" view'
  },
  tabsContainerStyles: {
    type: '?Record<string, any>',
    description: 'Styles for "tabs" view'
  },
}
</script>

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
        <SelectInputLine v-model="model2" :mode="'tabs'" :items="items2" :prefix="'Tab:'"
          :tabs-container-styles="{ maxWidth: '700px' }" />
      </div>

      <template #props>
        <PropsDisplay :data="propsDescription" />
      </template>

    </Split>
  </Layout>
</template>