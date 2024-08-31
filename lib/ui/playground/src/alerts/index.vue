<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { faker } from '@faker-js/faker';
import { range, toList } from '@milaboratory/helpers';
import { Checkbox, PlAlert } from '@milaboratory/platforma-uikit.lib';
import { reactive } from 'vue';

const data = reactive({
  icon: false,
  monospace: false,
  whiteSpacePre: false,
});

const paragraph = faker.lorem.paragraph();

const paragraphs = toList(range(0, 12)).map(() => faker.lorem.paragraph());

const json = {
  label: 'Some json',
  users: [
    {
      name: 'Ivan',
      age: 12,
    },
    {
      name: 'Petr',
      age: 132,
    },
  ],
};
</script>

<template>
  <Layout>
    <Split name="Alerts">
      <div class="d-flex d-flex-row gap-12">
        <Checkbox v-model="data.icon">Show Icon</Checkbox>
        <Checkbox v-model="data.monospace">Monospace</Checkbox>
        <Checkbox v-model="data.whiteSpacePre">White space pre</Checkbox>
      </div>
      {{ data }}
      <div class="d-flex d-flex-column gap-24" style="max-width: 600px">
        <PlAlert v-bind="data">{{ json }}</PlAlert>
        <PlAlert v-bind="data" closeable>Closeable</PlAlert>
        <PlAlert v-bind="data" label="My label" closeable>With label</PlAlert>
        <PlAlert v-bind="data" type="error" label="Error" closeable>Error </PlAlert>
        <PlAlert v-bind="data" type="warn" label="Warn" closeable>Warning </PlAlert>
        <PlAlert v-bind="data" type="info" label="Info" closeable>Information (neutral) </PlAlert>
        <PlAlert v-bind="data" label="Basic" closeable>Without type </PlAlert>
        <PlAlert v-bind="data" label="One paragraph" closeable>{{ paragraph }}</PlAlert>
        <PlAlert :model-value="data.icon" v-bind="data" label="Multiple paragraphs">
          <p v-for="(it, i) in paragraphs" :key="i">
            {{ it }}
          </p>
        </PlAlert>
        <PlAlert label="test" />
      </div>
    </Split>
  </Layout>
</template>
