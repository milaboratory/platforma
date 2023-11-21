export function requestTick<P>(cb: (...args: P[]) => void) {
  let tick = false;

  return function handle(...args: P[]) {
    if (!tick) {
      requestAnimationFrame(() => {
        cb(...args);
        tick = false;
      });
      tick = true;
    } else {
      console.log('handle pressure');
    }
  };
}
