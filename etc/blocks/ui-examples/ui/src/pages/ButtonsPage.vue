<script setup lang="ts">
import { PlBlockPage, PlBtnAccent, PlBtnGhost, PlBtnPrimary, PlBtnSecondary } from '@platforma-sdk/ui-vue';
import { reactive, ref } from 'vue';

const counter = ref(0);

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
    </div>
  </PlBlockPage>
</template>
