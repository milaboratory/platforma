import type { Ref } from 'vue';
import { ref, nextTick, onMounted, onUpdated } from 'vue';

export function useButtonTarget(hasMonetization: Ref<boolean>) {
  const target = ref<string>();

  const selector = '.pl-block-page__title__append';

  const check = () => {
    nextTick(() => {
      if (!hasMonetization.value) {
        target.value = undefined;
        return;
      }

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
