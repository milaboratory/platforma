import {Ref, ref, watch} from 'vue';
import {notEmpty} from '@/lib/helpers/utils';

const $store = new Map<string, Ref<string | null>>;

function getValue(key: string) {
  if (!$store.has(key)) {
    $store.set(key, ref(localStorage.getItem(key)));
  }

  return notEmpty($store.get(key), '...');
}

function setValue(key: string, v: string | null | undefined) {
  if (v === undefined || v === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, v);
  }
}

export function useLocalStorage<T extends string>(key: string) {
  const value = getValue(key) as Ref<T | null>;

  watch(value, (v) => setValue(key, v));

  return value;
}
