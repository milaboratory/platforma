<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField, MaskIcon } from '@milaboratory/platforma-uikit.lib';
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';

const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const data = reactive({
  text: 'Some text',
  lorem,
});

const onClick = () => alert('Some action');
</script>

<template>
  <Layout>
    <Split name="Text Field" :hide-second="true">
      <PlTextField v-model="data.text" />
      <PlTextField v-model="data.text" label="Data for next label" />
      <PlTextField v-model="data.text" label="Required" required />
      <PlTextField v-model="data.text" label="With fixed prefix" prefix="Data /&nbsp;" />
      <PlTextField v-model="data.text" label="With fixed prefix & clearable" prefix="Data /&nbsp;" clearable />
      <PlTextField :label="data.text" placeholder="In label will be the value from the previous input" />
      <PlTextField label="Has error" :error="lorem" />
      <PlTextField label="Disabled" disabled />
      <PlTextField label="Dashed contour" dashed />
      <PlTextField v-model="data.lorem" label="Clearable" clearable />
      <PlTextField v-model="data.lorem" label="Append icon" clearable>
        <template #tooltip>
          First line <br />
          Second line
        </template>
        <template #append>
          <MaskIcon name="chevron-right" @click="onClick" />
        </template>
      </PlTextField>
    </Split>
  </Layout>
</template>
