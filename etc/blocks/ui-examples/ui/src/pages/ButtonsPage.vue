<script setup lang="ts">
import { PlBlockPage, PlBtnAccent, PlBtnGhost, PlBtnPrimary, PlBtnSecondary, PlBtnSplit } from '@platforma-sdk/ui-vue';
import { reactive, ref } from 'vue';

const model = ref('value-1');
const counter = ref(0);
const options = Array(5).fill(0).map((v, i) => ({ label: `Item${i}`, value: `value-${i}` }));
const data = reactive({
  size: 'medium' as const,
  round: false,
  reverse: false,
  loading: false,
  disabled: false,
});

function onClick() {
  counter.value++;
}
function clickHandler() {
  console.log(model.value);
}
</script>
<template>
  <PlBlockPage>
    <template #title>Buttons</template>
    <div class="d-flex gap-8 align-center">
      <PlBtnPrimary
        icon="add"
        :round="data.round"
        :reverse="data.reverse"
        :size="data.size"
        :loading="data.loading"
        :disabled="data.disabled"
        @click="onClick"
      >
        Btn primary
      </PlBtnPrimary>
      <PlBtnSecondary
        icon="add"
        :round="data.round"
        :reverse="data.reverse"
        :size="data.size"
        :loading="data.loading"
        :disabled="data.disabled"
        @click="onClick"
      >
        Btn secondary
      </PlBtnSecondary>
      <PlBtnAccent
        icon="add"
        :round="data.round"
        :reverse="data.reverse"
        :size="data.size"
        :loading="data.loading"
        :disabled="data.disabled"
        @click="onClick"
      >
        Btn accent
      </PlBtnAccent>
      <PlBtnGhost
        :round="data.round"
        :reverse="data.reverse"
        :size="data.size"
        :loading="data.loading"
        :disabled="data.disabled"
        icon="add"
        @click="onClick"
      >
        Btn ghost
      </PlBtnGhost>

      <PlBtnSplit v-model="model" :options="options" @click="clickHandler"/>
    </div>
  </PlBlockPage>
</template>
