import {MaybeRef} from '@/lib/types';
import {onMounted, onUnmounted, unref} from 'vue';

type Position = {
  x: number;
  y: number;
};

export function useDraggable<T extends HTMLElement>(elRef: MaybeRef<T | undefined>, cb: (ev: MouseEvent) => void) {
  function onMove(down: Position, ev: MouseEvent) {
    const el = unref(elRef);
    if (!el) {
      return;
    }
    const translate = `translate(${ev.x - down.x}px, ${ev.y - down.y}px)`;
    el.style.setProperty('transform', translate);
    cb(ev);
  }

  function onDown(down: Position) {
    const listener = (e: MouseEvent) => onMove(down, e);

    document.addEventListener('mousemove', listener);

    document.addEventListener('mouseup', () => {
      const el = unref(elRef);

      document.removeEventListener('mousemove', listener);

      if (!el) {
        return;
      }

      el.style.setProperty('transition', 'all .3s ease-in-out');

      el.style.removeProperty('transform');

      el.addEventListener('transitionend', () => {
        el.style.removeProperty('transition');
      });

    }, {once: true});
  }

  function init() {
    unref(elRef)?.addEventListener('mousedown', onDown);
  }

  function clear() {
    unref(elRef)?.removeEventListener('mousedown', onDown);
  }

  onMounted(init);
  onUnmounted(clear);
}
