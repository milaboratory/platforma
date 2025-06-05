<script lang="ts" setup>
import { PlErrorBoundary, PlBlockPage, PlBtnPrimary } from '@platforma-sdk/ui-vue';
import { defineComponent, ref } from 'vue';

const counter = ref(1);

const incrementCounter = () => {
  counter.value += 1;
};

const BrokenComponent = defineComponent({
  name: 'BrokenComponent',
  props: {
    count: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    return () => {
      if (props.count % 3 === 0) {
        throw new Error('Broken component message: counter is divisible by 3');
      }
      return 'Component Loaded Correctly when counter is not divisible by 3:' + props.count;
    };
  },
});
</script>

<template>
  <PlBlockPage>
    <template #title>
      <span>PlErrorBoundary</span>
    </template>
    <template #append>
      <PlBtnPrimary @click="incrementCounter">
        <span>Reload (Counter: {{ counter }})</span>
      </PlBtnPrimary>
    </template>
    <PlErrorBoundary>
      <BrokenComponent :count="counter" />
    </PlErrorBoundary>
  </PlBlockPage>
</template>
