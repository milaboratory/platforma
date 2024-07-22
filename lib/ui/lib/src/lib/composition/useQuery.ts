import { reactive } from 'vue';
import { debounce } from '@milaboratory/helpers/functions';

export function useQuery<P extends unknown[], R>(fn: (...args: P) => Promise<R>) {
  const self = reactive({
    isLoading: false,
    result: undefined as R | undefined,
    error: undefined as unknown,
    async run(...args: P) {
      this.isLoading = true;
      this.error = undefined;
      try {
        this.result = await fn(...args);
      } catch (err: unknown) {
        this.error = err;
      } finally {
        this.isLoading = false;
      }
    },
    debounce(cb: () => P, dt = 1000) {
      return debounce(() => {
        const args = cb();
        this.run(...args).catch(console.error);
      }, dt);
    },
  });

  self.run = self.run.bind(self);

  return self;
}
