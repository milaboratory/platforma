<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextArea } from '@milaboratories/uikit';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import { times } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';

const data = reactive({
  text: 'Some text' as string,
  text2: '',
  lorem: times(10, () => faker.lorem.paragraph()).join('\n'),
});

const error = times(4, () => faker.lorem.paragraph()).join('\n');

// const onClick = () => alert('Some action');
</script>

<template>
  <Layout>
    <Split name="Text Field" :hide-second="true">
      <pre style="max-width: 600px; overflow: auto">{{ data }}</pre>

      <PlTextArea v-model="data.lorem" label="Text Area" :rows="10" :error="error" required />
      <PlTextArea v-model="data.lorem" label="Text Area" autogrow required />
    </Split>
  </Layout>
</template>
