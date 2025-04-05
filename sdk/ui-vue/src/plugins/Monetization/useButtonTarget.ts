import { ref, nextTick, onMounted, onUpdated } from 'vue';

export function useButtonTarget() {
  const target = ref<string>();

  const selector = '.pl-block-page__title__append';

  const check = () => {
    nextTick(() => {
      target.value = document.querySelector(selector) ? selector : undefined;
      if (!target.value) {
        console.error(
          `[Monetization] use #title slot to place monetization button`,
        );
      }
    });
  };

  onMounted(check);
  onUpdated(check);

  return target;
}
