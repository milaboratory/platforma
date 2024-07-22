import { type Ref, onMounted } from 'vue';
import { useEventListener } from '@/lib/composition/useEventListener';
import { requestTick } from '@/lib/helpers/utils';

export function useScroll($el: Ref<HTMLElement | undefined>, fadeHeight: number | null = null, fadeWidth: number | null = null) {
  function getYMask(el: HTMLElement) {
    const { scrollTop, scrollHeight, clientHeight } = el;

    const hasScroll = scrollHeight > clientHeight;

    if (!hasScroll || !fadeHeight) {
      return null;
    }

    const scrollBottom = scrollHeight - scrollTop - clientHeight;
    const offsetTop = scrollTop > fadeHeight ? fadeHeight : 0;
    const offsetBottom = scrollBottom > fadeHeight ? clientHeight - fadeHeight - offsetTop : clientHeight;

    return `linear-gradient(
        to bottom,
        transparent,
        black ${offsetTop}px,
        black ${offsetBottom}px,
        transparent 100%
      )`;
  }

  function getXMask(el: HTMLElement) {
    const { scrollLeft, scrollWidth, clientWidth } = el;

    const hasScroll = scrollWidth > clientWidth;

    if (!hasScroll || !fadeWidth) {
      return null;
    }

    const scrollRight = scrollWidth - scrollLeft - clientWidth;
    const offsetLeft = scrollLeft > fadeWidth ? fadeWidth : 0;
    const offsetRight = scrollRight > fadeWidth ? clientWidth - fadeWidth - offsetLeft : clientWidth;

    return `linear-gradient(
        to right,
        transparent,
        black ${offsetLeft}px,
        black ${offsetRight}px,
        transparent 100%
      )`;
  }

  function update() {
    const el = $el.value;

    if (!el) {
      return;
    }

    const masks = [getYMask(el), getXMask(el)].filter((m) => m !== null);
    el.style.setProperty('-webkit-mask-image', masks.join(','));
    el.style.setProperty('mask-image', masks.join(','));
    if (masks.length > 1) {
      el.style.setProperty('-webkit-mask-composite', 'source-in');
      el.style.setProperty('mask-composite', 'source-in');
    }
  }

  const handle = requestTick(update);

  onMounted(update);
  useEventListener(window, 'scroll', handle, true);
  useEventListener(window, 'resize', handle, true);
}
