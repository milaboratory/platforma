<script lang="ts" setup>
import { inject, unref } from 'vue';
import TodoItem from './TodoItem.vue';
import { todoListKey } from './keys';
import { notEmpty } from '@milaboratories/helpers';
import { randomString } from '@milaboratories/helpers';

const state = notEmpty(inject(todoListKey), 'Empty state');

function addItem() {
  unref(state).addItem(randomString(10));
}
</script>

<template>
  <div class="todo-list">
    <TodoItem v-for="(it, i) in state.items" :id="it.id" :key="i" />
    <button @click.stop="addItem">Add</button>
  </div>
</template>

<style lang="scss" scoped>
.todo-list {
  display: flex;
  flex-direction: column;
  > div {
    display: flex;
    align-items: center;
    height: 30px;
    border-bottom: 1px solid #ccc;
  }
  > button {
    min-height: 40px;
    user-select: none;
  }
}
</style>
