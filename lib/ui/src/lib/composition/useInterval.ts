import { onMounted, onUnmounted } from 'vue';

export function useInterval(update: () => void, ms: number) {
  let interval: number;
  onMounted(() => {
    interval = setInterval(update, ms);
  });
  onUnmounted(() => clearInterval(interval));
}
