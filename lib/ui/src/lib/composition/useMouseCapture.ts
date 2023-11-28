import {MaybeRef} from '@/lib/types';
import {unref} from 'vue';
import {useEventListener} from '@/lib/composition/useEventListener';
import {requestTick} from '@/lib/helpers/utils';

type CustomEvent = {
  dx: number;
  dy: number;
  stop?: boolean;
};

export function useMouseCapture<T extends HTMLElement>(elRef: MaybeRef<T | undefined>, cb: (ev: CustomEvent) => void) {
  const state = {
    el: undefined as HTMLElement | undefined,
    x: 0,
    y: 0
  };

  useEventListener(document, 'mousedown', ev => {
    if (ev.target === unref(elRef)) {
      state.el = unref(elRef);
      state.x = ev.x;
    }
  });

  useEventListener(document, 'mouseup', ev => {
    if (!state.el) {
      return;
    }

    state.el = undefined;

    cb({
      dx: ev.x - state.x,
      dy: ev.y - state.y,
      stop: true
    });
  });

  const handle = requestTick(cb);


  useEventListener(document, 'mousemove', ev => {
    if (state.el) {
      handle({
        dx: ev.x - state.x,
        dy: ev.y - state.y
      });
    }
  });
}
