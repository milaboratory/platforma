// import { expect, test } from 'vitest';
// import { computed, reactive } from 'vue';
// import { defineStore } from 'lib';

// const useStore = defineStore(() => {
//   const state = reactive({
//     age: 1,
//     name: 'Ivan',
//   });

//   const doubleAge = computed(() => state.age * 2);

//   function incrementAge() {
//     state.age++;
//   }

//   return { state, doubleAge, incrementAge };
// });

// test.skip('defineStore', async () => {
//   const store = useStore();

//   expect(store.state.age).toBe(1);

//   expect(store.doubleAge).toBe(2);

//   store.state.age = 2;

//   expect(store.state.age).toBe(2);

//   expect(store.doubleAge).toBe(4);

//   store.incrementAge();

//   expect(store.doubleAge).toBe(6);

//   store[Symbol.dispose]();
// });
