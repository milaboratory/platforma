<script setup lang="ts">
import Layout from '../Layout.vue';
import Split from '../Split.vue';

const classes: string[] = [
  'text-h1',
  'text-h2',
  'text-h3',
  'text-subtitle-m',
  'text-subtitle-s',
  'text-m',
  'text-m-btn',
  'text-m-link',
  'text-s ',
  'text-s-btn',
  'text-s-link',
  'text-mono-m',
  'text-mono-s',
  'text-caps13',
  'text-caps11',
  'text-description',
];

const text = 'Lorem Ipsum is simply dummy text of the printing and typesetting industry.';
</script>

<template>
  <Layout>
    <Split name="Typography">
      <div v-for="(classStr, index) in classes" :key="index" class="typography-container">
        <h2>{{ classStr }}</h2>
        <div :class="classStr">{{ text }}</div>
      </div>
    </Split>
  </Layout>
</template>

<style scoped lang="scss">
.split__column:not([data-theme]) {
  h2 {
    color: #dfe0e5;
  }
}

.typography-container {
  background-color: var(--txt-03);
  padding: 16px;
  border-radius: 6px;

  h2 {
    padding: 4px 8px;
    display: inline-block;
    border-radius: 6px;
    background-color: var(--color-ic-link);
    font-family: 'Spline Sans Mono';
  }
}
</style>
