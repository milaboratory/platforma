<script lang="ts" setup>
import { useApp } from './app';
import StoreTest from './components/StoreTest.vue';
import Navigate from './components/Navigate.vue';
import { reactive } from 'vue';

const data = reactive({
  instances: 0,
});

const app = useApp();

const removeInstance = () => {
  if (data.instances > 0) {
    data.instances--;
  }
};
</script>

<template>
  <div style="width: 600px">
    <h3>Hi, I am Main Page</h3>
    <Navigate class="mb-24" />
    <fieldset v-if="false">
      <legend>App</legend>
      <div>{{ app }}</div>
    </fieldset>
    <button @click="data.instances++">Create store</button>
    <button @click="removeInstance">Remove store</button>
    <store-test v-for="i in data.instances" :key="i" />
  </div>
</template>
