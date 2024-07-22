import { expect, test } from 'vitest';
import { computed, reactive } from 'vue';

test('Merge Reactive', async () => {
  const merged = reactive({
    age: 1,
    name: 'Ivan',
    doubleAge: computed(() => merged.age * 2),
  });

  const profile = computed(() => [merged.name, merged.age].join(':'));

  expect(profile.value).toBe('Ivan:1');

  expect(merged.doubleAge).toBe(2);

  merged.name = 'Petr';

  expect(profile.value).toBe('Petr:1');

  merged.age = 2;

  expect(profile.value).toBe('Petr:2');

  expect(merged.doubleAge).toBe(4);
});

test('Merge Reactive 2', async () => {
  const state = reactive({
    age: 1,
    name: 'Ivan',
  });

  const getters = {
    doubleAge: computed(() => state.age * 2),
  };

  const merged = Object.assign(state, getters);

  const profile = computed(() => [merged.name, merged.age].join(':'));

  expect(profile.value).toBe('Ivan:1');

  expect(merged.doubleAge).toBe(2);

  merged.name = 'Petr';

  expect(profile.value).toBe('Petr:1');

  merged.age = 3;

  expect(profile.value).toBe('Petr:3');

  expect(merged.doubleAge).toBe(6);
});

// test('Merge Reactive 3', async () => {
//   const state = {
//     age: 1,
//     name: 'Ivan',
//   };

//   const getters = {
//     doubleAge: computed(() => state.age * 2),
//   };

//   const merged = reactive(Object.assign(state, getters));

//   const profile = computed(() => [merged.name, merged.age].join(':'));

//   expect(profile.value).toBe('Ivan:1');

//   expect(merged.doubleAge).toBe(2);

//   merged.name = 'Petr';

//   expect(profile.value).toBe('Petr:1');

//   merged.age = 3;

//   expect(profile.value).toBe('Petr:3');

//   expect(merged.doubleAge).toBe(6);
// });
