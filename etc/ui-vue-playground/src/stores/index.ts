import { computed, reactive } from 'vue';
import { defineStore } from '@platforma-sdk/ui-vue';

export const useStore = defineStore(() => {
  const state = reactive({
    age: 1,
    name: 'Ivan'
  });

  const doubleAge = computed(() => state.age * 2);

  function incrementAge() {
    state.age++;
  }

  return { state, doubleAge, incrementAge };
});
