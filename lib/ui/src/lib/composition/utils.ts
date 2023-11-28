import {onMounted, onUpdated} from 'vue';

export function onChanged(hook: () => unknown) {
  onMounted(hook);
  onUpdated(hook);
}
