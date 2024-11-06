<script setup lang="ts">
import { PlBlockPage, PlTextField } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';
const model = ref('Some text');
</script>
<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 300px">
      <div>Text</div>
      <PlTextField v-model="model" placeholder="Text" />
      <div>Password</div>
      <PlTextField v-model="model" placeholder="Password" type="password" />
    </div>
  </PlBlockPage>
</template>
