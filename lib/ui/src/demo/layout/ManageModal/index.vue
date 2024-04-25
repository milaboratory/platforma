<script lang="ts" setup>
import { computed, reactive } from 'vue';
import ManageModal from '@/lib/components/ManageModal/index.vue';
import type { ColumnInfo, ManageModalSettings } from '@/lib/components/ManageModal/types';
import { strings } from '@milaboratory/helpers';
import type { MySpec } from './domain';
import First from './forms/First.vue';
import Second from './forms/Second.vue';

const data = reactive({
  open: false,
  inputs: [
    {
      type: 'first',
      value: false,
    },
    {
      type: 'second',
      age: 100,
      title: 'Test',
    },
  ] as MySpec[],
  newInputs: undefined as unknown,
  test: 0,
});

const entitiesRef = computed(() =>
  data.inputs.map((input) => ({
    id: strings.uniqueId(),
    spec: input,
  })),
);

const settings = computed(() => {
  const settings: ManageModalSettings<MySpec> = {
    title: 'Manage me',
    columnSettings: [
      {
        title: 'One title',
        description: 'One description',
        component: First,
        defaultSpec: () => ({
          type: 'first',
          value: true,
        }),
      },
      {
        title: 'Second title',
        description: 'Second description',
        component: Second,
        defaultSpec: () => ({
          type: 'second',
          age: 100,
          title: 'Default title',
        }),
      },
    ],
    items: entitiesRef.value,
    defaultColumn() {
      return this.columnSettings[0];
    },
    findColumnSettings(s: MySpec) {
      return this.columnSettings.find((it) => {
        return it.defaultSpec().type === s.type;
      })!;
    },
  };

  console.log('new settings ...');

  return settings;
});

const onUpdate = (columns: ColumnInfo[]) => {
  data.newInputs = columns;
  data.inputs = columns.map((col) => col.spec) as MySpec[];
  data.open = false;
};
</script>

<template>
  <button @click="data.open = true">Open manage modal</button>
  <ManageModal v-model="data.open" :settings="settings" @update:columns="onUpdate" />
  <pre>
    {{ data.inputs }}
  </pre>
</template>
