import {InjectionKey} from 'vue';
import {randomString} from '@/lib/helpers/utils';
import {tapIf} from '@/lib/helpers/functions';

export type Item = {
  id: number;
  text: string;
  completed?: boolean;
}

export type TodoState = {
  items: Item[],
  addItem(text: string): void;
  markAsCompleted(id: number): void;
};

export function defaultState(): TodoState {
  return {
    items: [{
      id: 1,
      text: randomString(10),
    }],
    addItem(text: string) {
      const id = this.items.map(it => it.id).reduce((x, y) => x > y ? x : y) + 1;
      this.items.push({
        id,
        text
      })
    },
    markAsCompleted(id: number) {
      tapIf(this.items.find(it => it.id === id), it => it.completed = true);
    }
  }
}

export const todoListKey = Symbol() as InjectionKey<TodoState>;
