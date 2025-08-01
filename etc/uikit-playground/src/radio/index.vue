<script setup lang="ts">
import Layout from '../Layout.vue';
import Split from '../Split.vue';
import { faker } from '@faker-js/faker';
import { PlRadio, PlRadioGroup, randomString } from '@milaboratories/uikit';
import { ref } from 'vue';

function generateOption() {
  const id = randomString(8);
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  return { id, firstName, lastName, sex };
}

type Option = ReturnType<typeof generateOption>;

const options = Array.from({ length: 4 }, () => {
  const person = generateOption();
  return {
    label: faker.person.fullName(person),
    value: person,
    disabled: faker.datatype.boolean(1 / 4),
  };
});

const standaloneValue = ref<Option>();
const groupValue = ref<Option>();
const groupWithOptionsValue = ref<Option>();

function prettifyValue<T>(value: T) {
  return value ? JSON.stringify(value, null, 2) : '<unset>';
}
</script>

<template>
  <Layout>
    <Split name="Radio" >
      <div :class="$style.container">
        <h1>Standalone</h1>
        <PlRadio
          v-for="option in options"
          :key="option.value.id"
          v-model="standaloneValue"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </PlRadio>
        <output>Current value:
          <pre>{{ prettifyValue(standaloneValue) }}</pre>
        </output>
      </div>
      <div :class="$style.container">
        <h1>Grouped</h1>
        <PlRadioGroup v-model="groupValue">
          <template #label>Group Label</template>
          <PlRadio
            v-for="option in options"
            :key="option.value.id"
            v-model="groupValue"
            :value="option.value"
            :disabled="option.disabled"
          >
            {{ option.label }}
          </PlRadio>
        </PlRadioGroup>
        <output>Current value:
          <pre>{{ prettifyValue(groupValue) }}</pre>
        </output>
      </div>
      <div :class="$style.container">
        <h1>Grouped, with <code :style="{ fontSize: 'inherit' }">options</code> prop</h1>
        <PlRadioGroup
          v-model="groupWithOptionsValue"
          :options="options"
          :key-extractor="option => option.id"
        >
          <template #label>Group Label</template>
        </PlRadioGroup>
        <output>Current value:
          <pre>{{ prettifyValue(groupWithOptionsValue) }}</pre>
        </output>
      </div>
    </Split>
  </Layout>
</template>

<style module>
  .container {
    display: flex;
    flex-direction: column;
    max-inline-size: max-content;
    gap: 8px;
    color: var(--txt-01);
    h1 {
      font-size: 2rem;
      line-height: 1.5;
      margin-block-end: 16px;
    }
    output {
      margin-block-start: 12px;
    }
  }
</style>
