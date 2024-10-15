<script setup lang="ts">
import { reactive } from 'vue';
import { PlTextField, MaskIcon16 } from '@platforma-sdk/ui-vue';

const data = reactive({
  model: 'Input text',
  label: 'Input label',
});

function onClick() {
  alert('Some external action');
}
</script>

<template>
  <PlTextField v-model="data.model" v-bind="data">
    <!-- Pass a custom HTML to the `#tooltip` slot -->
    <template #tooltip>
      <div>
        First line
        <a href="#">link</a>
      </div>
      <div>Second line</div>
    </template>
    <template #append>
      <MaskIcon16 name="chevron-right" @click="onClick" />
    </template>
  </PlTextField>
</template>
