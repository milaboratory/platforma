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
const model1 = ref({ i: 35 }); //{ i: 35 } | 'Nikolai' | 'Grisha' | 7 //options= [{text:'Grisha', value:7}]
const model2 = ref({ i: 2 });

const propsDescription = {
  modelValue: {
    type: 'Option;',
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
  options: {
    type: 'Option[];',
    description: 'Items for component'
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
      <div style="display: flex;">
        <SelectInputLine v-model="model0" :options="items0" :prefix="'Option:'" :input-max-width="'200px'">
          <template #item="slotProps">
            <DropdownListItem v-bind="slotProps" :size="'medium'" />
          </template>
        </SelectInputLine>
        <SelectInputLine v-model="model1" :options="items1" :prefix="'List:'" :disabled="true" />
        <SelectInputLine v-model="model1" :options="items1" :prefix="'List:'" />
        <SelectInputLine v-model="model2" :mode="'tabs'" :options="items2" :prefix="'Tab:'"
          :tabs-container-styles="{ maxWidth: '700px' }" />
      </div>

      <template #props>
        <PropsDisplay :data="propsDescription" />
      </template>

    </Split>
  </Layout>
</template>

<style>
.ui-select-input-line {
  margin-right: 25px;
}
</style>