<script lang="ts" setup>
import { blockApp } from './app';
import Navigate from './components/Navigate.vue';

const app = blockApp.use();
</script>

<template>
  <div>
    <h3>Hi, I am Main Page</h3>
    <Navigate />
    <fieldset>
      <legend>App</legend>
      <div>{{ app }}</div>
    </fieldset>
  </div>
</template>
