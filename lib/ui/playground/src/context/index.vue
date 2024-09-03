<script lang="ts" setup>
import Layout from '@/Layout.vue';
import TodoList from '@/context/TodoList.vue';
import { reactive } from 'vue';
import type { TodoState } from '@/context/keys';
import { ContextProvider } from '@milaboratory/platforma-uikit.lib';
import { todoListKey, defaultState } from './keys';

const todoApp1 = reactive<TodoState>(defaultState());
const todoApp2 = reactive<TodoState>(defaultState());
</script>

<template>
  <Layout>
    <div class="row-pane">
      <button @click.stop="() => todoApp1.addItem('first')">Ext change state1</button>
      <button @click.stop="() => todoApp2.addItem('second')">Ext change state2</button>
    </div>
    <div class="row-pane">
      <ContextProvider :context-key="todoListKey" :context="todoApp1">
        <TodoList />
      </ContextProvider>
      <ContextProvider :context-key="todoListKey" :context="todoApp2">
        <TodoList />
      </ContextProvider>
    </div>
  </Layout>
</template>

<style lang="scss">
.row-pane {
  display: flex;
  margin-bottom: 20px;
  gap: 20px;

  > div {
    flex: 1;
  }

  > button {
    min-height: 40px;
    user-select: none;
  }
}
</style>
