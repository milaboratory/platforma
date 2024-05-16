<script lang="ts" setup>
import { computed, reactive } from 'vue';
import ManageModal from '@/lib/components/ManageModal/index.vue';
import type { ManageModalSettings, Column } from '@/lib/components/ManageModal/types';
import { strings } from '@milaboratory/helpers';
import type { MySpec } from './domain';
import First from './forms/First.vue';
import Second from './forms/Second.vue';
import Third from './forms/Third.vue';
import { objects } from '@milaboratory/helpers';

const data = reactive({
  open: false,
  inputs: [] as MySpec[],
  newInputs: undefined as unknown,
  test: 0,
});

const entitiesRef = computed(() =>
  data.inputs.map((input) => ({
    id: strings.uniqueId(),
    spec: input,
  })),
);

const settings = computed<ManageModalSettings<MySpec>>(() => {
  const settings: ManageModalSettings<MySpec> = {
    title: 'Manage items',
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
          title: '',
          label: '',
        }),
        resolveTitle() {
          return this.type === 'second' ? this.label : 'unknown';
        },
        refine() {
          if (this.type === 'second' && !this.title) {
            this.title = 'Second title refined';
          }

          return this;
        },
      },
      {
        title: 'Third title',
        description: 'Third description',
        component: Third,
        defaultSpec: () => ({
          type: 'third',
          check: false,
          title1: '...',
          title2: '...',
          title3: '...',
          title4: '...',
          title5: '...',
          title6: '...',
          title7: '...',
          title8: '...',
        }),
      },
    ],
    items: entitiesRef.value,
    defaultColumnSettings() {
      return this.columnSettings[0];
    },
    findColumnSettings(s: MySpec) {
      return this.columnSettings.find((it) => {
        return it.defaultSpec().type === s.type;
      })!;
    },
    validate(spec: unknown) {
      if (objects.isObject(spec) && 'type' in spec && 'label' in spec) {
        return typeof spec.label === 'string' && !!spec.label;
      }

      return true;
    },
  };

  return settings;
});

const onUpdate = (columns: Column[]) => {
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
