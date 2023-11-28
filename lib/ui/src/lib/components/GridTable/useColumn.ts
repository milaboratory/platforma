import {useEventListener} from '@/lib/composition/useEventListener.ts';
import {useMouseUp} from './useMouseUp';
import {requestTick} from '@/lib/helpers';

export function useColumn(cb: (state: {x: number; width: number; diff: number}) => void, clear: () => void) {
  let state = undefined as {x: number; width: number} | undefined;

  function start(e: { x: number; width: number; }) {
    state = {...e};
  }

  useMouseUp(() => {
    state = undefined;
    clear();
  });

  const handle = requestTick(cb);

  useEventListener(window, 'mousemove', (e: { x: number }) => {
    if (state) {
      handle({
        x: state.x,
        width: state.width,
        diff: e.x - state.x
      });
    }
  });

  return {
    start
  };
}
