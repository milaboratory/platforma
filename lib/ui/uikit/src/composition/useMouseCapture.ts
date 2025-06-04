import type { MaybeRef } from '../types';
import { unref } from 'vue';
import { useEventListener } from '../composition/useEventListener';

type CustomEvent = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  stop?: boolean;
};

type CaptureState = {
  el: HTMLElement | undefined;
  x: number;
  y: number;
};

export function useMouseCapture<T extends HTMLElement>(elRef: MaybeRef<T | undefined>, cb: (ev: CustomEvent, state: CaptureState) => void) {
  const state: CaptureState = {
    el: undefined as HTMLElement | undefined,
    x: 0,
    y: 0,
  };

  const createCustom = (ev: MouseEvent) => ({
    x: ev.x,
    y: ev.y,
    dx: ev.x - state.x,
    dy: ev.y - state.y,
  });

  useEventListener(document, 'mousedown', (ev) => {
    if (ev.target === unref(elRef)) {
      // disable selection when moving
      if (ev.stopPropagation) ev.stopPropagation();
      if (ev.preventDefault) ev.preventDefault();
      state.el = unref(elRef);
      state.x = ev.x;
      state.y = ev.y;
    }
  });

  useEventListener(document, 'mouseup', (ev) => {
    if (!state.el) {
      return;
    }

    state.el = undefined;

    cb(
      {
        ...createCustom(ev),
        stop: true,
      },
      state,
    );
  });

  useEventListener(document, 'mousemove', (ev) => {
    if (state.el) {
      cb(createCustom(ev), state);
    }
  });
}
