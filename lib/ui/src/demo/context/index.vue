<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import TodoList from '@/demo/context/TodoList.vue';
import {reactive} from 'vue';
import {TodoState} from '@/demo/context/keys';
import ContextProvider from '@/lib/components/ContextProvider.vue';
import {todoListKey, defaultState} from './keys';

const todoApp1 = reactive<TodoState>(defaultState());
const todoApp2 = reactive<TodoState>(defaultState());

console.log('td', todoListKey);
</script>

<template>
  <layout>
    <div class="row-pane">
      <button @click.stop="() => todoApp1.addItem('first')">Ext change state1</button>
      <button @click.stop="() => todoApp2.addItem('second')">Ext change state2</button>
    </div>
    <div class="row-pane">
      <context-provider :contextKey="todoListKey" :context="todoApp1">
        <todo-list/>
      </context-provider>
      <context-provider :contextKey="todoListKey" :context="todoApp2">
        <todo-list/>
      </context-provider>
    </div>
  </layout>
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
