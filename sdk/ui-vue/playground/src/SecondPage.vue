<script lang="ts" setup>
import { useApp } from './app';
import Navigate from './components/Navigate.vue';

const app = useApp();
</script>

<template>
  <div>
    <h3>Hi, I am Second Page</h3>
    <Navigate />
    <fieldset>
      <legend>App</legend>
      <div>{{ app }}</div>
    </fieldset>
  </div>
</template>
