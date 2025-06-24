import { ensureError } from '@platforma-sdk/model';
import { onMounted, shallowRef } from 'vue';

export function useMiPlots() {
  const load = async () => {
    const { MiPlots } = await import('@milaboratories/miplots4');
    return MiPlots;
  };

  const miplots = shallowRef<Awaited<ReturnType<typeof load>>>();

  const error = shallowRef<Error>();

  onMounted(async () => {
    try {
      miplots.value = await load();
    } catch (err) {
      error.value = ensureError(err);
    }
  });

  return { miplots, error };
}
