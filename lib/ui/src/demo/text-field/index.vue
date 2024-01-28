<script setup lang="ts">
import { reactive } from 'vue';
import TextField from '@/lib/components/TextField.vue';
import MaskIcon from '@/lib/components/MaskIcon.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';

const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const data = reactive({
  text: 'Some text',
  lorem,
});

function onClick() {
  alert('Some external action');
}
</script>

<template>
  <layout>
    <split name="Text Field">
      <text-field v-model="data.text" />
      <text-field v-model="data.text" label="Data for next label" />
      <text-field v-model="data.text" label="With fixed prefix" prefix="Data /&nbsp;" />
      <text-field v-model="data.text" label="With fixed prefix & clearable" prefix="Data /&nbsp;" clearable />
      <text-field :label="data.text" placeholder="In label will be the value from the previous input" />
      <text-field label="Has error" :error="lorem" />
      <text-field label="Disabled" disabled />
      <text-field label="Dashed contour" dashed />
      <text-field v-model="data.lorem" label="Clearable" clearable />
      <text-field v-model="data.lorem" label="Append icon" clearable>
        <template #tooltip> First line Second line </template>
        <template #append>
          <mask-icon name="chevron-right" @click="onClick" />
        </template>
      </text-field>
    </split>
  </layout>
</template>
