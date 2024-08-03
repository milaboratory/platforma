<script lang="ts" setup>
import Layout from '@/Layout.vue';
import type { Component } from 'vue';
import { reactive, h } from 'vue';
import TestForm from './TestForm.vue';

const MyComponent: Component = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(TestForm, {
        modelValue: props.modelValue,
        'onUpdate:modelValue': (value) => emit('update:modelValue', value),
      });
  },
};

const test = reactive({
  user: { name: 'Ivan' },
});
</script>

<template>
  <layout>
    <div style="border: 1px solid red; height: 50px; background-color: #fff">
      <my-component v-model="test.user" />
    </div>
  </layout>
</template>
