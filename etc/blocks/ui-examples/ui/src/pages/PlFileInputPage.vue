<script setup lang="ts">
import { PlBlockPage, PlFileInput } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const props = reactive({
  model: undefined,
});

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 400px">
      <PlFileInput
        v-model="props.model"
        :extensions="['txt']"
        error="hello my"
      />
    </div>
  </PlBlockPage>
</template>
