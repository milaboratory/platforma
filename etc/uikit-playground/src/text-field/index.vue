<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField, MaskIcon16, PlTextArea } from '@milaboratories/uikit';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';

const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const data = reactive({
  text: 'Some text' as string,
  text2: '',
  lorem,
});

const onClick = () => alert('Some action');
</script>

<template>
  <Layout>
    <Split name="Text Field" :hide-second="true">
      <pre style="max-width: 600px; overflow: auto">{{ data }}</pre>
      <PlTextField
        v-model="data.text2"
        label="Validation"
        :rules="[(v) => v.length > 5 || 'Should be over 5 characters', (v) => v.length > 10 || 'Should be over 10 characters']"
      />
      <PlTextField v-model="data.text" />
      <PlTextField v-model="data.text" label="Data for next label" />
      <PlTextField v-model="data.text" label="Clearable" clearable />
      <PlTextField v-model="data.text" label="Clearable" :clearable="() => 'default'" />
      <PlTextField v-model="data.text" label="Required" required />
      <PlTextField v-model="data.text" label="With fixed prefix" prefix="Data /&nbsp;" />
      <PlTextField v-model="data.text" label="With fixed prefix & clearable" prefix="Data /&nbsp;" clearable />
      <PlTextField v-model="data.text" :label="data.text" placeholder="In label will be the value from the previous input" />
      <PlTextField v-model="data.text" label="Has error" :error="lorem" />
      <PlTextField v-model="data.text" label="Disabled" disabled />
      <PlTextField v-model="data.text" label="Dashed contour" dashed />
      <PlTextField v-model="data.lorem" label="Clearable" clearable />
      <PlTextField v-model="data.lorem" label="Append icon" clearable>
        <template #tooltip>
          First line <br />
          Second line
        </template>
        <template #append>
          <MaskIcon16 name="chevron-right" @click="onClick" />
        </template>
      </PlTextField>

      <PlTextArea v-model="data.lorem" label="Text Area" required />
    </Split>
  </Layout>
</template>
