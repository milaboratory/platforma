import { onMounted, onUnmounted } from 'vue';

export function useInterval(update: () => void, ms: number) {
  let interval: ReturnType<typeof setInterval>;
  onMounted(() => {
    interval = setInterval(update, ms);
  });
  onUnmounted(() => clearInterval(interval));
}
